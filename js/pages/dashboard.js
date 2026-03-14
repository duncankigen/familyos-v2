/**
 * js/pages/dashboard.js
 * ─────────────────────────────────────────────────────
 * Dashboard — summary cards, recent tasks, goal progress,
 * latest announcements, AI insights strip.
 */

async function renderDashboard() {
  setTopbar('Dashboard');
  const fid = State.fid;
  const sb  = DB.client;

  const [
    { data: contrib },
    { data: exp },
    { data: members },
    { data: tasks },
    { data: goals },
    { data: announcements },
    { data: insights },
  ] = await Promise.all([
    sb.from('contributions').select('amount,created_at').eq('family_id', fid),
    sb.from('expenses').select('amount,created_at').eq('family_id', fid),
    sb.from('users').select('*').eq('family_id', fid).eq('is_active', true),
    sb.from('tasks').select('*').eq('family_id', fid).neq('status', 'completed').order('deadline'),
    sb.from('family_goals').select('*').eq('family_id', fid).eq('status', 'active'),
    sb.from('announcements')
      .select(`
        id,
        title,
        message,
        created_at,
        is_pinned,
        author:users!announcements_created_by_fkey(full_name)
      `)
      .eq('family_id', fid)
      .eq('is_archived', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3),
    sb.from('ai_insights').select('*').eq('family_id', fid).eq('is_read', false).order('created_at', { ascending: false }).limit(3),
  ]);

  const now = new Date();
  const mo  = now.getMonth();
  const yr  = now.getFullYear();

  const totalContrib = (contrib  || []).reduce((a, b) => a + Number(b.amount), 0);
  const totalExp     = (exp      || []).reduce((a, b) => a + Number(b.amount), 0);
  const moContrib    = (contrib  || [])
    .filter(c => { const d = new Date(c.created_at); return d.getMonth() === mo && d.getFullYear() === yr; })
    .reduce((a, b) => a + Number(b.amount), 0);
  const overdue = (tasks || []).filter(t => t.deadline && new Date(t.deadline) < now).length;

  document.getElementById('page-content').innerHTML = `
    <div class="content">

      <!-- Metrics -->
      <div class="g4 mb16">
        <div class="metric-card">
          <div class="metric-label">Family Balance</div>
          <div class="metric-value" style="color:var(--accent);">KES ${fmt(totalContrib - totalExp)}</div>
          <div class="metric-sub">All time</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">This Month</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(moContrib)}</div>
          <div class="metric-sub">Contributions</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Pending Tasks</div>
          <div class="metric-value" style="color:${overdue > 0 ? 'var(--warning)' : 'var(--text)'};">${(tasks || []).length}</div>
          <div class="metric-sub">${overdue} overdue</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Active Members</div>
          <div class="metric-value">${(members || []).length}</div>
          <div class="metric-sub">In workspace</div>
        </div>
      </div>

      <!-- Tasks + Goals -->
      <div class="g2 mb16">
        <div class="card">
          <div class="card-title">Active Tasks</div>
          ${(tasks || []).slice(0, 5).map(t => `
            <div class="flex-between mb8">
              <div>
                <div style="font-size:13px;">${t.title}</div>
                <div style="font-size:11px;color:var(--text3);">Due: ${fmtDate(t.deadline)}</div>
              </div>
              ${statusBadge(t.status)}
            </div>`).join('')}
          ${!(tasks || []).length ? empty('No pending tasks') : ''}
          <button class="btn btn-sm" style="margin-top:8px;" onclick="nav('tasks')">View all tasks</button>
        </div>

        <div class="card">
          <div class="card-title">Family Goals</div>
          ${(goals || []).slice(0, 4).map(g => {
            const pct = Math.min(100, Math.round(g.current_amount / g.target_amount * 100));
            return `
              <div class="mb12">
                <div class="flex-between mb8">
                  <span style="font-size:13px;">${g.title}</span>
                  <span style="font-size:11px;color:var(--text3);">${pct}%</span>
                </div>
                <div class="progress">
                  <div class="progress-fill" style="width:${pct}%;background:var(--accent);"></div>
                </div>
              </div>`;
          }).join('')}
          ${!(goals || []).length ? empty('No goals set') : ''}
        </div>
      </div>

      <!-- Announcements + AI -->
      <div class="g2 mb16">
        <div class="card">
          <div class="card-title">Announcements</div>
          ${(announcements || []).map(a => `
            <div style="padding:10px;background:var(--bg3);border-radius:var(--radius-sm);margin-bottom:8px;">
              <div style="font-size:11px;font-weight:600;color:var(--accent);">
                ${a.author?.full_name || 'Admin'} · ${ago(a.created_at)}
              </div>
              <div style="font-size:13px;font-weight:600;margin-top:2px;">
                ${a.title}
                ${a.is_pinned ? '<span class="badge b-amber" style="margin-left:4px;">Pinned</span>' : ''}
              </div>
              <div style="font-size:12px;color:var(--text2);margin-top:3px;">
                ${a.message.substring(0, 100)}${a.message.length > 100 ? '...' : ''}
              </div>
            </div>`).join('')}
          ${!(announcements || []).length ? empty('No announcements') : ''}
          <button class="btn btn-sm" style="margin-top:8px;" onclick="nav('announcements')">View all announcements</button>
        </div>

        <div class="card">
          <div class="card-title">AI Insights</div>
          ${(insights || []).map(i => `
            <div class="ai-card ai-${i.severity === 'warning' ? 'amber' : i.severity === 'alert' ? 'red' : i.severity === 'success' ? 'green' : 'blue'}">
              <div class="ai-tag" style="color:var(--${i.severity === 'warning' ? 'warning' : i.severity === 'alert' ? 'danger' : i.severity === 'success' ? 'success' : 'accent'});">
                ${i.title}
              </div>
              <div class="ai-msg">${i.message}</div>
            </div>`).join('')}
          ${!(insights || []).length
            ? `<div class="ai-card ai-blue">
                <div class="ai-tag" style="color:var(--accent)">AI Advisor</div>
                <div class="ai-msg">Visit the AI Advisor page to generate insights for your family.</div>
               </div>`
            : ''}
          <button class="btn btn-sm" onclick="nav('ai')">Open AI Advisor</button>
        </div>
      </div>

    </div>`;
}

Router.register('dashboard', renderDashboard);
