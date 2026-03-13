/**
 * js/pages/tasks.js
 * ─────────────────────────────────────────────────────
 * Task tracker with status columns: pending / in_progress / completed.
 */

async function renderTasks() {
  setTopbar('Tasks', `<button class="btn btn-primary btn-sm" onclick="openAddTask()">+ Add Task</button>`);
  const sb = DB.client;

  const [{ data: tasks }, { data: members }] = await Promise.all([
    sb.from('tasks').select('*,users(full_name),projects(name)').eq('family_id', State.fid).order('deadline'),
    sb.from('users').select('id,full_name').eq('family_id', State.fid),
  ]);

  const cols = [
    { key: 'pending',     label: 'Pending',     color: 'var(--warning)' },
    { key: 'in_progress', label: 'In Progress',  color: 'var(--accent)'  },
    { key: 'completed',   label: 'Completed',    color: 'var(--success)' },
  ];

  const grouped = {};
  cols.forEach(c => { grouped[c.key] = []; });
  (tasks || []).forEach(t => {
    const bucket = grouped[t.status] || [];
    bucket.push(t);
    grouped[t.status] = bucket;
  });

  const now = new Date();

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total</div>
          <div class="metric-value">${(tasks || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">Pending</div>
          <div class="metric-value" style="color:var(--warning);">${(grouped.pending || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">In Progress</div>
          <div class="metric-value" style="color:var(--accent);">${(grouped.in_progress || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">Overdue</div>
          <div class="metric-value" style="color:var(--danger);">${(tasks || []).filter(t => t.deadline && new Date(t.deadline) < now && t.status !== 'completed').length}</div></div>
      </div>

      <div class="g3">
        ${cols.map(col => `
          <div>
            <div style="font-size:11px;font-weight:700;color:${col.color};text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">
              ${col.label} (${(grouped[col.key] || []).length})
            </div>
            <div class="flex-col">
              ${(grouped[col.key] || []).map(t => {
                const isOverdue = t.deadline && new Date(t.deadline) < now && t.status !== 'completed';
                return `
                  <div class="card" style="border-left:3px solid ${col.color};">
                    <div style="font-size:13px;font-weight:600;margin-bottom:6px;">${t.title}</div>
                    <div style="font-size:11px;color:var(--text3);margin-bottom:8px;">
                      ${t.users?.full_name ? '👤 ' + t.users.full_name : ''} 
                      ${t.projects?.name   ? '📁 ' + t.projects.name  : ''}
                    </div>
                    ${t.deadline ? `
                      <div style="font-size:11px;${isOverdue ? 'color:var(--danger);font-weight:600;' : 'color:var(--text3);'}">
                        ${isOverdue ? '⚠ Overdue: ' : 'Due: '}${fmtDate(t.deadline)}
                      </div>` : ''}
                    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                      ${col.key !== 'in_progress' && col.key !== 'completed' ? `
                        <button class="btn btn-sm" onclick="updateTaskStatus('${t.id}','in_progress')">Start</button>` : ''}
                      ${col.key !== 'completed' ? `
                        <button class="btn btn-sm" style="background:var(--success-bg);color:var(--success);" onclick="updateTaskStatus('${t.id}','completed')">✓ Done</button>` : ''}
                    </div>
                  </div>`;
              }).join('')}
              ${!(grouped[col.key] || []).length ? `<div style="font-size:12px;color:var(--text3);text-align:center;padding:20px;">No tasks</div>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

async function updateTaskStatus(taskId, status) {
  await DB.client.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', taskId);
  renderPage('tasks');
}

async function openAddTask() {
  const sb = DB.client;
  const [{ data: members }, { data: projects }] = await Promise.all([
    sb.from('users').select('id,full_name').eq('family_id', State.fid),
    sb.from('projects').select('id,name').eq('family_id', State.fid).eq('status', 'active'),
  ]);

  Modal.open('Add Task', `
    <div class="form-group"><label class="form-label">Task Title</label>
      <input id="t-title" class="form-input" placeholder="Plant maize in Block A"/></div>
    <div class="form-group"><label class="form-label">Description</label>
      <textarea id="t-desc" class="form-textarea" placeholder="Task details..."></textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Assign To</label>
        <select id="t-user" class="form-select">
          <option value="">— Unassigned —</option>
          ${(members || []).map(m => `<option value="${m.id}">${m.full_name}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Project</label>
        <select id="t-proj" class="form-select">
          <option value="">— None —</option>
          ${(projects || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Deadline</label>
        <input id="t-dead" class="form-input" type="date"/></div>
      <div class="form-group"><label class="form-label">Priority</label>
        <select id="t-prio" class="form-select">
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select></div>
    </div>
  `, [{ label: 'Create', cls: 'btn-primary', fn: async () => {
    const title = document.getElementById('t-title').value.trim();
    if (!title) return;
    await DB.client.from('tasks').insert({
      family_id:   State.fid,
      title,
      description: document.getElementById('t-desc').value,
      assigned_to: document.getElementById('t-user').value || null,
      project_id:  document.getElementById('t-proj').value || null,
      deadline:    document.getElementById('t-dead').value || null,
      priority:    document.getElementById('t-prio').value,
      status:      'pending',
      created_by:  State.uid,
    });
    Modal.close();
    renderPage('tasks');
  }}]);
}

Router.register('tasks', renderTasks);
