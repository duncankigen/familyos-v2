/**
 * js/pages/projects.js
 * All family projects: farming, construction, business,
 * investment. Card grid with budget progress.
 */

const ProjectsPage = {
  projects: [],
  membersById: {},
  vendors: [],
  vendorsById: {},
  leadersByProject: {},
  projectMembers: [],
  detailStorageKey: 'fos_project_detail',
};

function canManageProjects() {
  return ['admin', 'project_manager'].includes(State.currentProfile?.role);
}

function projectTypeColor(type) {
  return {
    farming: 'b-green',
    construction: 'b-amber',
    business: 'b-blue',
    investment: 'b-purple',
    other: 'b-gray',
  }[type] || 'b-gray';
}

function rememberActiveProject(projectId) {
  if (!projectId) {
    localStorage.removeItem(ProjectsPage.detailStorageKey);
    return;
  }

  localStorage.setItem(ProjectsPage.detailStorageKey, projectId);
}

function activeProjectId() {
  return localStorage.getItem(ProjectsPage.detailStorageKey) || '';
}

function projectLeaderName(project) {
  return ProjectsPage.leadersByProject[project.id]
    || ProjectsPage.membersById[project.created_by]?.full_name
    || 'Unassigned';
}

function openProjectCard(projectId) {
  rememberActiveProject(projectId);
  nav('project-detail');
}

function openProjectFarming(projectId) {
  rememberActiveProject(projectId);
  if (typeof setActiveFarmingProject === 'function') {
    setActiveFarmingProject(projectId);
  } else {
    localStorage.setItem('fos_farming_project', projectId);
  }
  nav('farming');
}

function backToProjects() {
  rememberActiveProject('');
  nav('projects');
}

function canManageProjectTeam() {
  return canManageProjects();
}

function canCreateProjectExpense() {
  return ['admin', 'treasurer', 'project_manager'].includes(State.currentProfile?.role);
}

function canCreateProjectTask() {
  return ['admin', 'project_manager', 'treasurer'].includes(State.currentProfile?.role);
}

function canLogProjectActivity() {
  return ['admin', 'project_manager'].includes(State.currentProfile?.role);
}

function projectActivityForm() {
  return `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Activity Type</label>
        <select id="proj-act-type" class="form-select">
          ${['update', 'site_visit', 'procurement', 'review', 'milestone', 'payment', 'other'].map((value) => `
            <option value="${value}">${value.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase())}</option>
          `).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Date</label>
        <input id="proj-act-date" class="form-input" type="date" value="${new Date().toISOString().slice(0, 10)}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cost (KES)</label>
        <input id="proj-act-cost" class="form-input" type="number" placeholder="Optional"/></div>
      <div class="form-group"><label class="form-label">Description</label>
        <input id="proj-act-desc" class="form-input" placeholder="What happened or what needs follow-up?" /></div>
    </div>
    <p id="project-activity-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
}

function projectExpenseForm(projectId) {
  return `
    <div class="form-group"><label class="form-label">Description</label>
      <input id="proj-exp-desc" class="form-input" placeholder="Cement purchase, legal fee, transport..." /></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Amount (KES)</label>
        <input id="proj-exp-amount" class="form-input" type="number" placeholder="5000" /></div>
      <div class="form-group"><label class="form-label">Category</label>
        <select id="proj-exp-cat" class="form-select">
          ${['materials', 'labor', 'transport', 'equipment', 'services', 'other'].map((value) => `
            <option value="${value}">${value.charAt(0).toUpperCase() + value.slice(1)}</option>
          `).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Vendor</label>
        <select id="proj-exp-vendor" class="form-select">
          <option value="">- None -</option>
          ${ProjectsPage.vendors.map((vendor) => `<option value="${vendor.id}">${escapeHtml(vendor.name)}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Reference</label>
        <input id="proj-exp-ref" class="form-input" placeholder="Invoice / M-Pesa reference" /></div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <textarea id="proj-exp-notes" class="form-textarea" placeholder="Optional notes for this project expense"></textarea></div>
    <input id="proj-exp-project" type="hidden" value="${projectId}" />
    <p id="project-expense-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
}

function projectTaskForm(projectId) {
  return `
    <div class="form-group"><label class="form-label">Task Title</label>
      <input id="proj-task-title" class="form-input" placeholder="Follow up on contractor quote" /></div>
    <div class="form-group"><label class="form-label">Description</label>
      <textarea id="proj-task-desc" class="form-textarea" placeholder="Task details..."></textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Assign To</label>
        <select id="proj-task-user" class="form-select">
          <option value="">- Unassigned -</option>
          ${Object.values(ProjectsPage.membersById).map((member) => `<option value="${member.id}">${escapeHtml(member.full_name)}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Priority</label>
        <select id="proj-task-priority" class="form-select">
          ${['low', 'medium', 'high', 'urgent'].map((value) => `<option value="${value}" ${value === 'medium' ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Deadline</label>
        <input id="proj-task-deadline" class="form-input" type="date" /></div>
      <div class="form-group"><label class="form-label">Status</label>
        <select id="proj-task-status" class="form-select">
          ${['pending', 'in_progress', 'completed', 'cancelled'].map((value) => `<option value="${value}" ${value === 'pending' ? 'selected' : ''}>${value.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase())}</option>`).join('')}
        </select></div>
    </div>
    <input id="proj-task-project" type="hidden" value="${projectId}" />
    <p id="project-task-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
}

function projectForm(project = null) {
  return `
    <div class="form-group"><label class="form-label">Project Name</label>
      <input id="p-name" class="form-input" placeholder="Kitale Maize Farm 2025" value="${escapeHtml(project?.name || '')}"/></div>
    <div class="form-group"><label class="form-label">Description</label>
      <textarea id="p-desc" class="form-textarea" placeholder="Project description...">${escapeHtml(project?.description || '')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Type</label>
        <select id="p-type" class="form-select">
          ${['farming', 'construction', 'business', 'investment', 'other'].map((value) => `
            <option value="${value}" ${project?.project_type === value || (!project && value === 'farming') ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>
          `).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Status</label>
        <select id="p-status" class="form-select">
          ${['planning', 'active', 'paused', 'completed', 'cancelled'].map((value) => `
            <option value="${value}" ${project?.status === value || (!project && value === 'planning') ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>
          `).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Budget (KES)</label>
        <input id="p-budget" class="form-input" type="number" placeholder="150000" value="${project?.budget ?? ''}"/></div>
      <div class="form-group"><label class="form-label">Start Date</label>
        <input id="p-start" class="form-input" type="date" value="${project?.start_date || ''}"/></div>
    </div>
    <div class="form-group"><label class="form-label">End Date</label>
      <input id="p-end" class="form-input" type="date" value="${project?.end_date || ''}"/></div>
    <p id="project-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
}

async function loadProjectOverviewData() {
  const sb = DB.client;
  const [{ data: projects, error: projectError }, { data: expenses, error: expenseError }, { data: members, error: memberError }] = await Promise.all([
    sb.from('projects').select('*').eq('family_id', State.fid).order('created_at', { ascending: false }),
    sb.from('expenses').select('project_id,amount').eq('family_id', State.fid),
    sb.from('users').select('id,full_name').eq('family_id', State.fid),
  ]);

  if (projectError || expenseError || memberError) {
    throw (projectError || expenseError || memberError);
  }

  ProjectsPage.projects = projects || [];
  ProjectsPage.membersById = Object.fromEntries((members || []).map((member) => [member.id, member]));
  ProjectsPage.leadersByProject = {};

  const projectIds = ProjectsPage.projects.map((project) => project.id);
  if (projectIds.length) {
    const { data: leaders, error: leaderError } = await sb
      .from('project_members')
      .select('project_id,user_id,role')
      .in('project_id', projectIds)
      .eq('role', 'leader');

    if (leaderError) {
      console.warn('[Projects] Failed to load project leaders:', leaderError);
    } else {
      (leaders || []).forEach((leader) => {
        if (!ProjectsPage.leadersByProject[leader.project_id]) {
          ProjectsPage.leadersByProject[leader.project_id] = ProjectsPage.membersById[leader.user_id]?.full_name || null;
        }
      });
    }
  }

  const spendByProject = {};
  (expenses || []).forEach((expense) => {
    spendByProject[expense.project_id] = (spendByProject[expense.project_id] || 0) + Number(expense.amount || 0);
  });

  return {
    projects: ProjectsPage.projects,
    spendByProject,
  };
}

async function renderProjects() {
  setTopbar(
    'Projects',
    canManageProjects() ? `<button class="btn btn-primary btn-sm" onclick="openAddProject()">+ New Project</button>` : ''
  );

  try {
    const { projects, spendByProject } = await loadProjectOverviewData();

    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="g4 mb16">
          <div class="metric-card"><div class="metric-label">Total Projects</div>
            <div class="metric-value">${projects.length}</div></div>
          <div class="metric-card"><div class="metric-label">Active</div>
            <div class="metric-value" style="color:var(--success);">${projects.filter((project) => project.status === 'active').length}</div></div>
          <div class="metric-card"><div class="metric-label">Total Budget</div>
            <div class="metric-value">KES ${fmt(projects.reduce((sum, project) => sum + Number(project.budget || 0), 0))}</div></div>
          <div class="metric-card"><div class="metric-label">Total Spent</div>
            <div class="metric-value" style="color:var(--warning);">KES ${fmt(Object.values(spendByProject).reduce((sum, amount) => sum + amount, 0))}</div></div>
        </div>

        <div class="g3">
          ${projects.map((project) => {
            const spent = spendByProject[project.id] || 0;
            const budget = Number(project.budget || 0);
            const pct = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0;
            return `
              <div class="card" style="cursor:pointer;" onclick="openProjectCard('${project.id}')">
                <div class="flex-between mb8">
                  <span class="badge ${projectTypeColor(project.project_type)}">${project.project_type}</span>
                  ${statusBadge(project.status)}
                </div>
                <div style="font-size:14px;font-weight:700;margin-bottom:4px;">${escapeHtml(project.name)}</div>
                <div style="font-size:12px;color:var(--text3);margin-bottom:12px;">
                  Leader: ${escapeHtml(projectLeaderName(project))}
                </div>
                ${budget > 0 ? `
                  <div class="flex-between mb8">
                    <span style="font-size:11px;color:var(--text3);">Budget used</span>
                    <span style="font-size:12px;">KES ${fmt(spent)} / ${fmt(budget)}</span>
                  </div>
                  <div class="progress">
                    <div class="progress-fill" style="width:${pct}%;background:var(--accent);"></div>
                  </div>` : `
                  <div style="font-size:11px;color:var(--text3);">No budget set yet</div>
                `}
              </div>`;
          }).join('')}
        </div>
        ${!projects.length ? `<div class="card">${empty('No projects yet - create your first one')}</div>` : ''}
      </div>`;
  } catch (error) {
    console.error('[Projects] Failed to load:', error);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load projects right now')}</div>
      </div>`;
  }
}

async function renderProjectDetail() {
  const projectId = activeProjectId();
  if (!projectId) {
    backToProjects();
    return;
  }

  const sb = DB.client;
  const [
    { data: project, error: projectError },
    { data: members, error: memberError },
    { data: vendors, error: vendorError },
    { data: projectMembers, error: projectMembersError },
    { data: tasks, error: taskError },
    { data: activities, error: activityError },
    { data: expenses, error: expenseError },
  ] = await Promise.all([
    sb.from('projects').select('*').eq('family_id', State.fid).eq('id', projectId).maybeSingle(),
    sb.from('users').select('id,full_name').eq('family_id', State.fid),
    sb.from('vendors').select('id,name').eq('family_id', State.fid).order('name'),
    sb.from('project_members').select('project_id,user_id,role').eq('project_id', projectId),
    sb.from('tasks').select('id,title,status,priority,deadline,assigned_user,completed_at').eq('family_id', State.fid).eq('project_id', projectId).order('deadline', { ascending: true }).limit(6),
    sb.from('project_activities').select('id,activity_type,description,activity_date,cost,created_by').eq('project_id', projectId).order('activity_date', { ascending: false }).limit(6),
    sb.from('expenses').select('id,amount,description,created_at,category,vendor_id').eq('family_id', State.fid).eq('project_id', projectId).order('created_at', { ascending: false }).limit(6),
  ]);

  if (projectError || memberError || vendorError || projectMembersError || taskError || activityError || expenseError) {
    console.error('[Projects] Failed to load project detail:', projectError || memberError || vendorError || projectMembersError || taskError || activityError || expenseError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load this project right now')}</div>
      </div>`;
    return;
  }

  if (!project) {
    rememberActiveProject('');
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Project not found')}</div>
      </div>`;
    setTopbar('Project', `<button class="btn btn-sm" onclick="backToProjects()">Back to Projects</button>`);
    return;
  }

  if (!ProjectsPage.projects.find((item) => item.id === project.id)) {
    ProjectsPage.projects = [project, ...ProjectsPage.projects.filter((item) => item.id !== project.id)];
  }

  ProjectsPage.membersById = Object.fromEntries((members || []).map((member) => [member.id, member]));
  ProjectsPage.vendors = vendors || [];
  ProjectsPage.vendorsById = Object.fromEntries((ProjectsPage.vendors || []).map((vendor) => [vendor.id, vendor]));
  const teamRows = (projectMembers || []).map((row) => ({
    ...row,
    member: ProjectsPage.membersById[row.user_id] || null,
  }));
  ProjectsPage.projectMembers = teamRows;
  const leader = teamRows.find((row) => row.role === 'leader');
  const leaderName = leader?.member?.full_name || ProjectsPage.membersById[project.created_by]?.full_name || 'Unassigned';
  const totalSpent = (expenses || []).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const budget = Number(project.budget || 0);
  const remaining = budget - totalSpent;
  const openTasks = (tasks || []).filter((task) => task.status !== 'completed').length;
  const completedTasks = (tasks || []).filter((task) => task.status === 'completed').length;
  const latestActivityDate = activities?.[0]?.activity_date || '';
  const isFarmingProject = project.project_type === 'farming';

  setTopbar(project.name, `
    <button class="btn btn-sm" onclick="backToProjects()">Back to Projects</button>
    ${canManageProjects() ? `<button class="btn btn-sm" onclick="openEditProject('${project.id}')">Manage Project</button>` : ''}
    ${isFarmingProject ? `<button class="btn btn-primary btn-sm" onclick="openProjectFarming('${project.id}')">Open Farm Manager</button>` : ''}
  `);
  document.querySelectorAll('.sb-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.page === 'projects');
  });

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card">
          <div class="metric-label">Budget</div>
          <div class="metric-value">KES ${fmt(budget)}</div>
          <div class="metric-sub">${budget > 0 ? `Remaining KES ${fmt(Math.max(remaining, 0))}` : 'No project budget set'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Spent</div>
          <div class="metric-value" style="color:var(--warning);">KES ${fmt(totalSpent)}</div>
          <div class="metric-sub">${expenses?.length || 0} recent expense entries</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Activity Log</div>
          <div class="metric-value">${activities?.length || 0}</div>
          <div class="metric-sub">${latestActivityDate ? `Latest ${fmtDate(latestActivityDate)}` : 'No updates logged yet'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Tasks</div>
          <div class="metric-value">${openTasks}</div>
          <div class="metric-sub">${completedTasks} completed</div>
        </div>
      </div>

      <div class="g2 mb16">
        <div class="card">
          <div class="card-title">Project Summary</div>
          <div class="flex-between mb8">
            <span class="badge ${projectTypeColor(project.project_type)}">${escapeHtml(project.project_type)}</span>
            ${statusBadge(project.status)}
          </div>
          ${project.description ? `
            <div style="font-size:13px;color:var(--text2);margin-bottom:12px;line-height:1.6;">
              ${escapeHtml(project.description)}
            </div>` : `
            <div style="font-size:13px;color:var(--text3);margin-bottom:12px;">No project description provided.</div>
          `}
          <div class="g2">
            <div>
              <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;">Leader</div>
              <div style="font-size:13px;font-weight:600;">${escapeHtml(leaderName)}</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;">Created</div>
              <div style="font-size:13px;font-weight:600;">${fmtDate(project.created_at)}</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;">Start Date</div>
              <div style="font-size:13px;font-weight:600;">${project.start_date ? fmtDate(project.start_date) : '-'}</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;">End Date</div>
              <div style="font-size:13px;font-weight:600;">${project.end_date ? fmtDate(project.end_date) : '-'}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="flex-between mb8">
            <div class="card-title" style="margin-bottom:0;">Team</div>
            ${canManageProjectTeam() ? `<button class="btn btn-sm" onclick="openManageProjectTeam()">Manage Team</button>` : ''}
          </div>
          ${(teamRows || []).map((row) => `
            <div class="flex-between mb8" style="padding:10px;background:var(--bg3);border-radius:var(--radius-sm);">
              <div>
                <div style="font-size:13px;font-weight:600;">${escapeHtml(row.member?.full_name || 'Unknown member')}</div>
                <div style="font-size:11px;color:var(--text3);text-transform:capitalize;">${escapeHtml(row.role || 'member')}</div>
              </div>
              ${roleBadge(row.role || 'member')}
            </div>`).join('')}
          ${!teamRows.length ? empty('No project members assigned yet') : ''}
        </div>
      </div>

      <div class="g2">
        <div class="card">
          <div class="flex-between mb8">
            <div class="card-title" style="margin-bottom:0;">Recent Tasks</div>
            ${canCreateProjectTask() ? `<button class="btn btn-sm" onclick="openProjectTaskModal('${project.id}')">+ Add Task</button>` : ''}
          </div>
          ${(tasks || []).map((task) => `
            <div class="flex-between mb8" style="padding:10px;background:var(--bg3);border-radius:var(--radius-sm);">
              <div>
                <div style="font-size:13px;font-weight:600;">${escapeHtml(task.title)}</div>
                <div style="font-size:11px;color:var(--text3);">
                  ${task.assigned_user ? `Assigned: ${escapeHtml(ProjectsPage.membersById[task.assigned_user]?.full_name || 'Unknown')}` : 'Unassigned'}
                  ${task.deadline ? ` | Due: ${fmtDate(task.deadline)}` : ''} | ${escapeHtml(task.priority || 'medium')}
                </div>
              </div>
              ${statusBadge(task.status)}
            </div>`).join('')}
          ${!(tasks || []).length ? empty('No tasks linked to this project yet') : ''}
          <button class="btn btn-sm" style="margin-top:8px;" onclick="nav('tasks')">Open Tasks</button>
        </div>

        <div class="card">
          <div class="flex-between mb8">
            <div class="card-title" style="margin-bottom:0;">Recent Activity</div>
            ${canLogProjectActivity() && !isFarmingProject ? `<button class="btn btn-sm" onclick="openProjectActivityModal('${project.id}')">+ Add Activity</button>` : ''}
          </div>
          ${(activities || []).map((activity) => `
            <div class="mb8" style="padding:10px;background:var(--bg3);border-radius:var(--radius-sm);">
              <div class="flex-between">
                <div style="font-size:13px;font-weight:600;">${escapeHtml(activity.activity_type || 'Activity')}</div>
                <div style="font-size:11px;color:var(--text3);">${activity.activity_date ? fmtDate(activity.activity_date) : '-'}</div>
              </div>
              ${activity.description ? `<div style="font-size:12px;color:var(--text2);margin-top:4px;">${escapeHtml(activity.description)}</div>` : ''}
              <div style="font-size:11px;color:var(--text3);margin-top:4px;">
                By ${escapeHtml(ProjectsPage.membersById[activity.created_by]?.full_name || 'Unknown')}
                ${activity.cost ? ` | Cost KES ${fmt(activity.cost)}` : ''}
              </div>
            </div>`).join('')}
          ${!(activities || []).length ? empty('No activity logged for this project yet') : ''}
          ${project.project_type === 'farming' ? `<button class="btn btn-sm" style="margin-top:8px;" onclick="openProjectFarming('${project.id}')">Open Farm Manager</button>` : ''}
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="card-title">Recent Expenses</div>
          ${(expenses || []).map((expense) => `
          <div class="flex-between mb8" style="padding:10px;background:var(--bg3);border-radius:var(--radius-sm);">
            <div>
              <div style="font-size:13px;font-weight:600;">${escapeHtml(expense.description || 'Expense')}</div>
              <div style="font-size:11px;color:var(--text3);">
                ${fmtDate(expense.created_at)}
                ${expense.category ? ` | ${escapeHtml(expense.category)}` : ''}
                ${expense.vendor_id ? ` | ${escapeHtml(ProjectsPage.vendorsById[expense.vendor_id]?.name || 'Vendor')}` : ''}
              </div>
            </div>
            <div style="font-size:13px;font-weight:700;color:var(--warning);">KES ${fmt(expense.amount || 0)}</div>
          </div>`).join('')}
        ${!(expenses || []).length ? empty('No expenses linked to this project yet') : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          ${canCreateProjectExpense() && !isFarmingProject ? `<button class="btn btn-sm" onclick="openProjectExpenseModal('${project.id}')">+ Add Expense</button>` : ''}
          <button class="btn btn-sm" onclick="nav('expenses')">Open Expenses</button>
        </div>
      </div>
    </div>`;
}

function openProjectActivityModal(projectId) {
  if (!canLogProjectActivity()) return;
  Modal.open('Log Project Activity', projectActivityForm(), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: async () => saveProjectActivity(projectId),
  }]);
}

async function saveProjectActivity(projectId) {
  hideErr('project-activity-err');
  const description = document.getElementById('proj-act-desc')?.value.trim() || '';
  if (!description) {
    showErr('project-activity-err', 'Describe the activity or update.');
    return;
  }

  const { error } = await DB.client.from('project_activities').insert({
    project_id: projectId,
    activity_type: document.getElementById('proj-act-type')?.value || 'other',
    activity_date: document.getElementById('proj-act-date')?.value || new Date().toISOString().slice(0, 10),
    description,
    cost: parseFloat(document.getElementById('proj-act-cost')?.value || '') || 0,
    created_by: State.uid,
  });

  if (error) {
    showErr('project-activity-err', error.message);
    return;
  }

  Modal.close();
  renderPage('project-detail');
}

function openProjectExpenseModal(projectId) {
  if (!canCreateProjectExpense()) return;
  Modal.open('Add Project Expense', projectExpenseForm(projectId), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: async () => saveProjectExpense(projectId),
  }]);
}

async function saveProjectExpense(projectId) {
  hideErr('project-expense-err');
  const description = document.getElementById('proj-exp-desc')?.value.trim() || '';
  const amount = parseFloat(document.getElementById('proj-exp-amount')?.value || '');

  if (!description) {
    showErr('project-expense-err', 'Description is required.');
    return;
  }
  if (!amount || amount <= 0) {
    showErr('project-expense-err', 'Enter a valid amount greater than zero.');
    return;
  }

  const { error } = await DB.client.from('expenses').insert({
    family_id: State.fid,
    created_by: State.uid,
    project_id: projectId,
    amount,
    description,
    category: document.getElementById('proj-exp-cat')?.value || 'other',
    vendor_id: document.getElementById('proj-exp-vendor')?.value || null,
    reference: document.getElementById('proj-exp-ref')?.value.trim() || null,
    notes: document.getElementById('proj-exp-notes')?.value.trim() || null,
  });

  if (error) {
    showErr('project-expense-err', error.message);
    return;
  }

  Modal.close();
  renderPage('project-detail');
}

function openProjectTaskModal(projectId) {
  if (!canCreateProjectTask()) return;
  Modal.open('Add Project Task', projectTaskForm(projectId), [{
    label: 'Create',
    cls: 'btn-primary',
    fn: async () => saveProjectTask(projectId),
  }]);
}

async function saveProjectTask(projectId) {
  hideErr('project-task-err');
  const title = document.getElementById('proj-task-title')?.value.trim() || '';
  if (!title) {
    showErr('project-task-err', 'Task title is required.');
    return;
  }

  const status = document.getElementById('proj-task-status')?.value || 'pending';
  const payload = {
    family_id: State.fid,
    project_id: projectId,
    title,
    description: document.getElementById('proj-task-desc')?.value.trim() || null,
    assigned_user: document.getElementById('proj-task-user')?.value || null,
    assigned_vendor: null,
    deadline: document.getElementById('proj-task-deadline')?.value || null,
    priority: document.getElementById('proj-task-priority')?.value || 'medium',
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
    created_by: State.uid,
  };

  const { data, error } = await DB.client.from('tasks').insert(payload).select('id,project_id,title,assigned_user').single();
  if (error) {
    showErr('project-task-err', error.message);
    return;
  }

  if (data?.assigned_user && data.assigned_user !== State.uid) {
    const projectName = ProjectsPage.projects.find((item) => item.id === projectId)?.name || 'a project';
    await Notifications.notifyUsers([data.assigned_user], {
      title: 'Task assigned to you',
      message: `${data.title} was assigned to you in ${projectName}.`,
      type: 'info',
      entity_type: 'task',
      entity_id: data.id,
    });
  }

  Modal.close();
  renderPage('project-detail');
}

function openEditProject(projectId) {
  if (!canManageProjects()) return;
  const project = ProjectsPage.projects.find((item) => item.id === projectId);
  if (!project) return;

  Modal.open('Manage Project', projectForm(project), [
    project.status !== 'cancelled' ? {
      label: 'Archive',
      cls: 'btn',
      fn: async () => archiveProject(projectId),
    } : null,
    {
      label: 'Save',
      cls: 'btn-primary',
      fn: async () => saveProject(projectId),
    },
  ].filter(Boolean));
}

async function archiveProject(projectId) {
  hideErr('project-err');
  const { error } = await DB.client
    .from('projects')
    .update({ status: 'cancelled' })
    .eq('id', projectId)
    .eq('family_id', State.fid);

  if (error) {
    showErr('project-err', error.message);
    return;
  }

  Modal.close();
  renderPage('project-detail');
}

function projectMemberForm(memberRow = null) {
  const existingUserIds = new Set(ProjectsPage.projectMembers.map((row) => row.user_id));
  return `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Member</label>
        <select id="pm-user" class="form-select" ${memberRow ? 'disabled' : ''}>
          <option value="">- Select -</option>
          ${Object.values(ProjectsPage.membersById)
            .filter((member) => memberRow || !existingUserIds.has(member.id))
            .map((member) => `<option value="${member.id}" ${memberRow?.user_id === member.id ? 'selected' : ''}>${escapeHtml(member.full_name)}</option>`)
            .join('')}
        </select>
        ${memberRow ? `<input id="pm-user-hidden" type="hidden" value="${memberRow.user_id}" />` : ''}
      </div>
      <div class="form-group"><label class="form-label">Role</label>
        <select id="pm-role" class="form-select">
          ${['leader', 'finance', 'worker', 'observer'].map((role) => `
            <option value="${role}" ${memberRow?.role === role ? 'selected' : ''}>${role.charAt(0).toUpperCase() + role.slice(1)}</option>
          `).join('')}
        </select>
      </div>
    </div>
    <p id="project-member-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
}

function openManageProjectTeam() {
  if (!canManageProjectTeam()) return;

  Modal.open('Manage Project Team', `
    <div class="flex-col">
      ${ProjectsPage.projectMembers.map((row) => `
        <div class="flex-between mb8" style="padding:10px;background:var(--bg3);border-radius:var(--radius-sm);">
          <div>
            <div style="font-size:13px;font-weight:600;">${escapeHtml(row.member?.full_name || 'Unknown member')}</div>
            <div style="font-size:11px;color:var(--text3);text-transform:capitalize;">${escapeHtml(row.role || 'worker')}</div>
          </div>
          <button class="btn btn-sm" onclick="openProjectMemberEditor('${row.id}')">Manage</button>
        </div>`).join('')}
      ${!ProjectsPage.projectMembers.length ? empty('No team members added yet') : ''}
    </div>
  `, [{
    label: 'Add Member',
    cls: 'btn-primary',
    fn: () => openProjectMemberEditor(),
  }]);
}

function openProjectMemberEditor(projectMemberId = '') {
  if (!canManageProjectTeam()) return;
  const memberRow = projectMemberId ? ProjectsPage.projectMembers.find((row) => row.id === projectMemberId) : null;

  Modal.open(memberRow ? 'Manage Team Member' : 'Add Team Member', projectMemberForm(memberRow), [
    memberRow ? {
      label: 'Remove',
      cls: 'btn',
      fn: async () => removeProjectMember(projectMemberId),
    } : null,
    {
      label: 'Save',
      cls: 'btn-primary',
      fn: async () => saveProjectMember(projectMemberId),
    },
  ].filter(Boolean));
}

async function saveProjectMember(projectMemberId = '') {
  hideErr('project-member-err');
  const projectId = activeProjectId();
  const userId = document.getElementById('pm-user-hidden')?.value || document.getElementById('pm-user')?.value || '';
  if (!userId) {
    showErr('project-member-err', 'Select a member.');
    return;
  }

  const payload = {
    project_id: projectId,
    user_id: userId,
    role: document.getElementById('pm-role')?.value || 'worker',
  };

  const query = projectMemberId
    ? DB.client.from('project_members').update(payload).eq('id', projectMemberId)
    : DB.client.from('project_members').insert(payload);

  const { error } = await query;
  if (error) {
    showErr('project-member-err', error.message);
    return;
  }

  Modal.close();
  renderPage('project-detail');
}

async function removeProjectMember(projectMemberId) {
  const { error } = await DB.client.from('project_members').delete().eq('id', projectMemberId);
  if (error) {
    showErr('project-member-err', error.message);
    return;
  }

  Modal.close();
  renderPage('project-detail');
}

async function openAddProject() {
  if (!canManageProjects()) return;

  const { data: members, error } = await DB.client
    .from('users')
    .select('id,full_name')
    .eq('family_id', State.fid);

  if (error) {
    console.error('[Projects] Failed to load members for project form:', error);
    return;
  }

  Modal.open('New Project', `${projectForm()}
    <div class="form-group"><label class="form-label">Project Leader</label>
      <select id="p-leader" class="form-select">
        <option value="">- Select -</option>
        ${(members || []).map((member) => `<option value="${member.id}">${escapeHtml(member.full_name)}</option>`).join('')}
      </select>
    </div>
  `, [{ label: 'Create', cls: 'btn-primary', fn: async () => {
    hideErr('project-err');
    const project = await saveProject();
    if (!project) return;

    const leaderId = document.getElementById('p-leader')?.value || '';
    if (leaderId) {
      const { error: leaderInsertError } = await DB.client
        .from('project_members')
        .insert({ project_id: project.id, user_id: leaderId, role: 'leader' });

      if (leaderInsertError) {
        showErr('project-err', leaderInsertError.message);
        return;
      }
    }

    Modal.close();
    rememberActiveProject(project.id);
    nav('project-detail');
  }}]);
}

async function saveProject(projectId = '') {
  hideErr('project-err');
  const name = document.getElementById('p-name')?.value.trim() || '';
  if (!name) {
    showErr('project-err', 'Project name is required.');
    return null;
  }

  const payload = {
    family_id: State.fid,
    name,
    description: document.getElementById('p-desc')?.value.trim() || null,
    project_type: document.getElementById('p-type')?.value || 'other',
    status: document.getElementById('p-status')?.value || 'planning',
    budget: parseFloat(document.getElementById('p-budget')?.value || '') || 0,
    start_date: document.getElementById('p-start')?.value || null,
    end_date: document.getElementById('p-end')?.value || null,
  };

  if (!projectId) {
    payload.created_by = State.uid;
  }

  const query = projectId
    ? DB.client.from('projects').update(payload).eq('id', projectId).eq('family_id', State.fid).select().single()
    : DB.client.from('projects').insert(payload).select().single();

  const { data, error } = await query;
  if (error) {
    showErr('project-err', error.message || 'Unable to save project.');
    return null;
  }

  if (projectId) {
    Modal.close();
    renderPage('project-detail');
  }

  return data;
}

Router.register('projects', renderProjects);
Router.register('project-detail', renderProjectDetail);
