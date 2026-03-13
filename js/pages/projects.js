/**
 * js/pages/projects.js
 * ─────────────────────────────────────────────────────
 * All family projects: farming, construction, business,
 * investment. Card grid with budget progress.
 */

async function renderProjects() {
  setTopbar('Projects', `<button class="btn btn-primary btn-sm" onclick="openAddProject()">+ New Project</button>`);
  const sb = DB.client;

  const [{ data: projects }, { data: expenses }] = await Promise.all([
    sb.from('projects').select('*,users(full_name)').eq('family_id', State.fid).order('created_at', { ascending: false }),
    sb.from('expenses').select('project_id,amount').eq('family_id', State.fid),
  ]);

  // Sum expenses per project
  const expMap = {};
  (expenses || []).forEach(e => { expMap[e.project_id] = (expMap[e.project_id] || 0) + Number(e.amount); });

  const typeColor = { farming: 'b-green', construction: 'b-amber', business: 'b-blue', investment: 'b-purple', other: 'b-gray' };

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Projects</div>
          <div class="metric-value">${(projects || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">Active</div>
          <div class="metric-value" style="color:var(--success);">${(projects || []).filter(p => p.status === 'active').length}</div></div>
        <div class="metric-card"><div class="metric-label">Total Budget</div>
          <div class="metric-value">KES ${fmt((projects || []).reduce((a, b) => a + Number(b.budget || 0), 0))}</div></div>
        <div class="metric-card"><div class="metric-label">Total Spent</div>
          <div class="metric-value" style="color:var(--warning);">KES ${fmt(Object.values(expMap).reduce((a, b) => a + b, 0))}</div></div>
      </div>

      <div class="g3">
        ${(projects || []).map(p => {
          const spent  = expMap[p.id] || 0;
          const budget = Number(p.budget || 0);
          const pct    = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0;
          return `
            <div class="card" style="cursor:pointer;" onclick="nav('farming')">
              <div class="flex-between mb8">
                <span class="badge ${typeColor[p.project_type] || 'b-gray'}">${p.project_type}</span>
                ${statusBadge(p.status)}
              </div>
              <div style="font-size:14px;font-weight:700;margin-bottom:4px;">${p.name}</div>
              <div style="font-size:12px;color:var(--text3);margin-bottom:12px;">
                Leader: ${p.users?.full_name || 'Unassigned'}
              </div>
              ${budget > 0 ? `
                <div class="flex-between mb8">
                  <span style="font-size:11px;color:var(--text3);">Budget used</span>
                  <span style="font-size:12px;">KES ${fmt(spent)} / ${fmt(budget)}</span>
                </div>
                <div class="progress">
                  <div class="progress-fill" style="width:${pct}%;background:var(--accent);"></div>
                </div>` : ''}
            </div>`;
        }).join('')}
      </div>
      ${!(projects || []).length ? `<div class="card">${empty('No projects yet — create your first one')}</div>` : ''}
    </div>`;
}

async function openAddProject() {
  const { data: members } = await DB.client
    .from('users').select('id,full_name').eq('family_id', State.fid);

  Modal.open('New Project', `
    <div class="form-group"><label class="form-label">Project Name</label>
      <input id="p-name" class="form-input" placeholder="Kitale Maize Farm 2025"/></div>
    <div class="form-group"><label class="form-label">Description</label>
      <textarea id="p-desc" class="form-textarea" placeholder="Project description..."></textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Type</label>
        <select id="p-type" class="form-select">
          <option value="farming">Farming</option>
          <option value="construction">Construction</option>
          <option value="business">Business</option>
          <option value="investment">Investment</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Status</label>
        <select id="p-status" class="form-select">
          <option value="planning">Planning</option>
          <option value="active">Active</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Budget (KES)</label>
        <input id="p-budget" class="form-input" type="number" placeholder="150000"/></div>
      <div class="form-group"><label class="form-label">Project Leader</label>
        <select id="p-leader" class="form-select">
          <option value="">— Select —</option>
          ${(members || []).map(m => `<option value="${m.id}">${m.full_name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Start Date</label>
        <input id="p-start" class="form-input" type="date"/></div>
      <div class="form-group"><label class="form-label">End Date</label>
        <input id="p-end"   class="form-input" type="date"/></div>
    </div>
  `, [{ label: 'Create', cls: 'btn-primary', fn: async () => {
    const { data: proj } = await DB.client.from('projects').insert({
      family_id:    State.fid,
      name:         document.getElementById('p-name').value,
      description:  document.getElementById('p-desc').value,
      project_type: document.getElementById('p-type').value,
      status:       document.getElementById('p-status').value,
      budget:       parseFloat(document.getElementById('p-budget').value) || 0,
      start_date:   document.getElementById('p-start').value || null,
      end_date:     document.getElementById('p-end').value   || null,
      created_by:   State.uid,
    }).select().single();

    const leaderId = document.getElementById('p-leader').value;
    if (proj && leaderId) {
      await DB.client.from('project_members').insert({ project_id: proj.id, user_id: leaderId, role: 'leader' });
    }
    Modal.close();
    renderPage('projects');
  }}]);
}

Router.register('projects', renderProjects);
