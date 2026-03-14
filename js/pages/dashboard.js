/**
 * js/pages/dashboard.js
 * ─────────────────────────────────────────────────────
 * Dashboard — summary cards, recent tasks, goal progress,
 * latest announcements, AI insights strip.
 */

async function attachDashboardAnnouncementAuthors(items) {
  const announcements = items || [];
  const authorIds = [...new Set(announcements.map((item) => item.created_by).filter(Boolean))];
  if (!authorIds.length) {
    return announcements.map((item) => ({ ...item, author: null }));
  }

  const { data: authors, error } = await DB.client
    .from('users')
    .select('id,full_name')
    .in('id', authorIds);

  if (error) {
    console.warn('[Dashboard] Failed to load announcement authors:', error);
    return announcements.map((item) => ({ ...item, author: null }));
  }

  const authorsById = Object.fromEntries((authors || []).map((author) => [author.id, author]));
  return announcements.map((item) => ({
    ...item,
    author: item.created_by ? (authorsById[item.created_by] || null) : null,
  }));
}

async function fetchDashboardFinanceSummary(fid) {
  const { data, error } = await DB.client.rpc('get_family_finance_summary', {
    p_family_id: fid,
  });

  const summary = Array.isArray(data) ? data[0] : data;
  if (!error && summary) {
    return {
      balance: Number(summary.balance || 0),
      this_month_contributions: Number(summary.this_month_contributions || 0),
      this_month_expenses: Number(summary.this_month_expenses || 0),
    };
  }

  const [{ data: contrib }, { data: exp }] = await Promise.all([
    DB.client.from('contributions').select('amount,created_at').eq('family_id', fid),
    DB.client.from('expenses').select('amount,created_at').eq('family_id', fid),
  ]);

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const totalContributions = (contrib || []).reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpenses = (exp || []).reduce((sum, item) => sum + Number(item.amount), 0);
  const thisMonthContributions = (contrib || [])
    .filter((item) => {
      const date = new Date(item.created_at);
      return date.getMonth() === month && date.getFullYear() === year;
    })
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const thisMonthExpenses = (exp || [])
    .filter((item) => {
      const date = new Date(item.created_at);
      return date.getMonth() === month && date.getFullYear() === year;
    })
    .reduce((sum, item) => sum + Number(item.amount), 0);

  return {
    balance: totalContributions - totalExpenses,
    this_month_contributions: thisMonthContributions,
    this_month_expenses: thisMonthExpenses,
  };
}

async function renderDashboard() {
  setTopbar('Dashboard');
  const fid = State.fid;
  const sb = DB.client;

  const [
    summary,
    { data: members },
    { data: tasks },
    { data: goals },
    { data: announcements },
    { data: insights },
  ] = await Promise.all([
    fetchDashboardFinanceSummary(fid),
    sb.from('users').select('*').eq('family_id', fid).eq('is_active', true),
    sb.from('tasks').select('*').eq('family_id', fid).neq('status', 'completed').order('deadline'),
    sb.from('family_goals').select('*').eq('family_id', fid).eq('status', 'active'),
    sb.from('announcements')
      .select(`
        id,
        created_by,
        title,
        message,
        created_at,
        is_pinned
      `)
      .eq('family_id', fid)
      .eq('is_archived', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3),
    sb.from('ai_insights').select('*').eq('family_id', fid).eq('is_read', false).order('created_at', { ascending: false }).limit(3),
  ]);

  const now = new Date();
  const overdue = (tasks || []).filter((task) => task.deadline && new Date(task.deadline) < now).length;
  const announcementFeed = await attachDashboardAnnouncementAuthors(announcements || []);
  const activeInsights = (insights || []).filter((insight) => !insight.expires_at || new Date(insight.expires_at) > now);

  document.getElementById('page-content').innerHTML = `
    <div class="content">

      <div class="g4 mb16">
        <div class="metric-card">
          <div class="metric-label">Family Balance</div>
          <div class="metric-value" style="color:var(--accent);">KES ${fmt(summary.balance)}</div>
          <div class="metric-sub">Contributions minus expenses</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">This Month In</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(summary.this_month_contributions)}</div>
          <div class="metric-sub">Out KES ${fmt(summary.this_month_expenses)}</div>
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

      <div class="g2 mb16">
        <div class="card">
          <div class="card-title">Active Tasks</div>
          ${(tasks || []).slice(0, 5).map((task) => `
            <div class="flex-between mb8">
              <div>
                <div style="font-size:13px;">${task.title}</div>
                <div style="font-size:11px;color:var(--text3);">Due: ${fmtDate(task.deadline)}</div>
              </div>
              ${statusBadge(task.status)}
            </div>`).join('')}
          ${!(tasks || []).length ? empty('No pending tasks') : ''}
          <button class="btn btn-sm" style="margin-top:8px;" onclick="nav('tasks')">View all tasks</button>
        </div>

        <div class="card">
          <div class="card-title">Family Goals</div>
          ${(goals || []).slice(0, 4).map((goal) => {
            const pct = Math.min(100, Math.round(goal.current_amount / goal.target_amount * 100));
            return `
              <div class="mb12">
                <div class="flex-between mb8">
                  <span style="font-size:13px;">${goal.title}</span>
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

      <div class="g2 mb16">
        <div class="card">
          <div class="card-title">Announcements</div>
          ${announcementFeed.map((announcement) => `
            <div style="padding:10px;background:var(--bg3);border-radius:var(--radius-sm);margin-bottom:8px;">
              <div style="font-size:11px;font-weight:600;color:var(--accent);">
                ${announcement.author?.full_name || 'Admin'} · ${ago(announcement.created_at)}
              </div>
              <div style="font-size:13px;font-weight:600;margin-top:2px;">
                ${announcement.title}
                ${announcement.is_pinned ? '<span class="badge b-amber" style="margin-left:4px;">Pinned</span>' : ''}
              </div>
              <div style="font-size:12px;color:var(--text2);margin-top:3px;">
                ${announcement.message.substring(0, 100)}${announcement.message.length > 100 ? '...' : ''}
              </div>
            </div>`).join('')}
          ${!(announcements || []).length ? empty('No announcements') : ''}
          <button class="btn btn-sm" style="margin-top:8px;" onclick="nav('announcements')">View all announcements</button>
        </div>

        <div class="card">
          <div class="card-title">AI Insights</div>
          ${activeInsights.map((insight) => `
            <div class="ai-card ai-${insight.severity === 'warning' ? 'amber' : insight.severity === 'alert' ? 'red' : insight.severity === 'success' ? 'green' : 'blue'}">
              <div class="ai-tag" style="color:var(--${insight.severity === 'warning' ? 'warning' : insight.severity === 'alert' ? 'danger' : insight.severity === 'success' ? 'success' : 'accent'});">
                ${insight.title}
              </div>
              <div class="ai-msg">${insight.message}</div>
            </div>`).join('')}
          ${!activeInsights.length
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
