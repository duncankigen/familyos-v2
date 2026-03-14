/**
 * js/pages/tasks.js
 * Task tracker with status columns: pending / in_progress / completed.
 */

const TasksPage = {
  tasks: [],
  membersById: {},
  projectsById: {},
  vendorsById: {},
  vendors: [],
};

function canCreateTasks() {
  return ['admin', 'project_manager', 'treasurer'].includes(State.currentProfile?.role);
}

function canUpdateTask(task) {
  return task?.assigned_user === State.uid || ['admin', 'project_manager'].includes(State.currentProfile?.role);
}

function taskStatusGroup(task) {
  return task.status === 'overdue' ? 'pending' : task.status;
}

function taskVendorName(vendorId) {
  return TasksPage.vendorsById[vendorId]?.name || null;
}

function taskForm(task = null) {
  return `
    <div class="form-group"><label class="form-label">Task Title</label>
      <input id="t-title" class="form-input" placeholder="Plant maize in Block A" value="${escapeHtml(task?.title || '')}"/></div>
    <div class="form-group"><label class="form-label">Description</label>
      <textarea id="t-desc" class="form-textarea" placeholder="Task details...">${escapeHtml(task?.description || '')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Assign To</label>
        <select id="t-user" class="form-select">
          <option value="">- Unassigned -</option>
          ${Object.values(TasksPage.membersById).map((member) => `<option value="${member.id}" ${task?.assigned_user === member.id ? 'selected' : ''}>${escapeHtml(member.full_name)}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Vendor</label>
        <select id="t-vendor" class="form-select">
          <option value="">- None -</option>
          ${TasksPage.vendors.map((vendor) => `<option value="${vendor.id}" ${task?.assigned_vendor === vendor.id ? 'selected' : ''}>${escapeHtml(vendor.name)}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Project</label>
        <select id="t-proj" class="form-select">
          <option value="">- None -</option>
          ${Object.values(TasksPage.projectsById).map((project) => `<option value="${project.id}" ${task?.project_id === project.id ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Priority</label>
        <select id="t-prio" class="form-select">
          ${['low', 'medium', 'high', 'urgent'].map((value) => `<option value="${value}" ${task?.priority === value || (!task && value === 'medium') ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Deadline</label>
        <input id="t-dead" class="form-input" type="date" value="${task?.deadline || ''}"/></div>
      <div class="form-group"><label class="form-label">Status</label>
        <select id="t-status" class="form-select">
          ${['pending', 'in_progress', 'completed', 'cancelled'].map((value) => `<option value="${value}" ${task?.status === value || (!task && value === 'pending') ? 'selected' : ''}>${value.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase())}</option>`).join('')}
        </select></div>
    </div>
    <p id="task-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
}

async function renderTasks() {
  setTopbar('Tasks', canCreateTasks() ? `<button class="btn btn-primary btn-sm" onclick="openAddTask()">+ Add Task</button>` : '');
  const sb = DB.client;

  const [{ data: tasks, error: taskError }, { data: members, error: memberError }, { data: projects, error: projectError }, { data: vendors, error: vendorError }] = await Promise.all([
    sb.from('tasks').select('id,family_id,project_id,title,description,assigned_user,assigned_vendor,status,priority,deadline,completed_at,created_by,created_at').eq('family_id', State.fid).order('deadline'),
    sb.from('users').select('id,full_name').eq('family_id', State.fid),
    sb.from('projects').select('id,name').eq('family_id', State.fid),
    sb.from('vendors').select('id,name').eq('family_id', State.fid),
  ]);

  if (taskError || memberError || projectError || vendorError) {
    console.error('[Tasks] Failed to load:', taskError || memberError || projectError || vendorError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load tasks right now')}</div>
      </div>`;
    return;
  }

  TasksPage.tasks = tasks || [];
  TasksPage.membersById = Object.fromEntries((members || []).map((member) => [member.id, member]));
  TasksPage.projectsById = Object.fromEntries((projects || []).map((project) => [project.id, project]));
  TasksPage.vendors = vendors || [];
  TasksPage.vendorsById = Object.fromEntries(TasksPage.vendors.map((vendor) => [vendor.id, vendor]));

  const cols = [
    { key: 'pending', label: 'Pending', color: 'var(--warning)' },
    { key: 'in_progress', label: 'In Progress', color: 'var(--accent)' },
    { key: 'completed', label: 'Completed', color: 'var(--success)' },
  ];

  const grouped = Object.fromEntries(cols.map((col) => [col.key, []]));
  TasksPage.tasks.forEach((task) => {
    const bucket = taskStatusGroup(task);
    if (grouped[bucket]) grouped[bucket].push(task);
  });

  const now = new Date();

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total</div>
          <div class="metric-value">${TasksPage.tasks.length}</div></div>
        <div class="metric-card"><div class="metric-label">Pending</div>
          <div class="metric-value" style="color:var(--warning);">${(grouped.pending || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">In Progress</div>
          <div class="metric-value" style="color:var(--accent);">${(grouped.in_progress || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">Overdue</div>
          <div class="metric-value" style="color:var(--danger);">${TasksPage.tasks.filter((task) => task.deadline && new Date(task.deadline) < now && task.status !== 'completed').length}</div></div>
      </div>

      <div class="g3">
        ${cols.map((col) => `
          <div>
            <div style="font-size:11px;font-weight:700;color:${col.color};text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">
              ${col.label} (${(grouped[col.key] || []).length})
            </div>
            <div class="flex-col">
              ${(grouped[col.key] || []).map((task) => {
                const isOverdue = task.deadline && new Date(task.deadline) < now && task.status !== 'completed';
                return `
                  <div class="card" style="border-left:3px solid ${isOverdue ? 'var(--danger)' : col.color};">
                    <div style="font-size:13px;font-weight:600;margin-bottom:6px;">${escapeHtml(task.title)}</div>
                    <div style="font-size:11px;color:var(--text3);margin-bottom:8px;">
                      ${TasksPage.membersById[task.assigned_user]?.full_name ? 'Assigned: ' + escapeHtml(TasksPage.membersById[task.assigned_user].full_name) : 'Unassigned'}
                      ${TasksPage.projectsById[task.project_id]?.name ? ` | Project: ${escapeHtml(TasksPage.projectsById[task.project_id].name)}` : ''}
                      ${taskVendorName(task.assigned_vendor) ? ` | Vendor: ${escapeHtml(taskVendorName(task.assigned_vendor))}` : ''}
                    </div>
                    ${task.description ? `<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">${escapeHtml(task.description)}</div>` : ''}
                    ${task.deadline ? `
                      <div style="font-size:11px;${isOverdue ? 'color:var(--danger);font-weight:600;' : 'color:var(--text3);'}">
                        ${isOverdue ? 'Overdue: ' : 'Due: '}${fmtDate(task.deadline)}
                      </div>` : ''}
                    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center;">
                      ${statusBadge(task.status)}
                      ${canUpdateTask(task) && col.key !== 'in_progress' && col.key !== 'completed' ? `
                        <button class="btn btn-sm" onclick="updateTaskStatus('${task.id}','in_progress')">Start</button>` : ''}
                      ${canUpdateTask(task) && col.key !== 'completed' ? `
                        <button class="btn btn-sm" style="background:var(--success-bg);color:var(--success);" onclick="updateTaskStatus('${task.id}','completed')">Done</button>` : ''}
                      ${canUpdateTask(task) ? `<button class="btn btn-sm" onclick="openEditTask('${task.id}')">Manage</button>` : ''}
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
  const payload = {
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
  };
  await DB.client.from('tasks').update(payload).eq('id', taskId);
  renderPage('tasks');
}

function openAddTask() {
  if (!canCreateTasks()) return;
  Modal.open('Add Task', taskForm(), [{
    label: 'Create',
    cls: 'btn-primary',
    fn: async () => saveTask(),
  }]);
}

function openEditTask(taskId) {
  const task = TasksPage.tasks.find((item) => item.id === taskId);
  if (!task || !canUpdateTask(task)) return;

  Modal.open('Manage Task', taskForm(task), [
    task.status !== 'cancelled' ? {
      label: 'Cancel Task',
      cls: 'btn',
      fn: async () => saveTask(taskId, 'cancelled'),
    } : null,
    {
      label: 'Save',
      cls: 'btn-primary',
      fn: async () => saveTask(taskId),
    },
  ].filter(Boolean));
}

async function saveTask(taskId = null, forcedStatus = '') {
  hideErr('task-err');
  const title = document.getElementById('t-title')?.value.trim() || '';
  if (!title) {
    showErr('task-err', 'Task title is required.');
    return;
  }

  const status = forcedStatus || document.getElementById('t-status')?.value || 'pending';
  const payload = {
    family_id: State.fid,
    title,
    description: document.getElementById('t-desc')?.value.trim() || null,
    assigned_user: document.getElementById('t-user')?.value || null,
    assigned_vendor: document.getElementById('t-vendor')?.value || null,
    project_id: document.getElementById('t-proj')?.value || null,
    deadline: document.getElementById('t-dead')?.value || null,
    priority: document.getElementById('t-prio')?.value || 'medium',
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
    created_by: State.uid,
  };

  const query = taskId
    ? DB.client.from('tasks').update(payload).eq('id', taskId)
    : DB.client.from('tasks').insert(payload);

  const { error } = await query;
  if (error) {
    showErr('task-err', error.message);
    return;
  }

  Modal.close();
  renderPage('tasks');
}

Router.register('tasks', renderTasks);
