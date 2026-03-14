/**
 * js/pages/projects.js
 * All family projects: farming, construction, business,
 * investment. Card grid with budget progress.
 */

const ProjectsPage = {
  projects: [],
  membersById: {},
  leadersByProject: {},
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

function backToProjects() {
  rememberActiveProject('');
  nav('projects');
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
    { data: projectMembers, error: projectMembersError },
    { data: tasks, error: taskError },
    { data: activities, error: activityError },
    { data: expenses, error: expenseError },
  ] = await Promise.all([
    sb.from('projects').select('*').eq('family_id', State.fid).eq('id', projectId).maybeSingle(),
    sb.from('users').select('id,full_name').eq('family_id', State.fid),
    sb.from('project_members').select('project_id,user_id,role').eq('project_id', projectId),
    sb.from('tasks').select('id,title,status,priority,deadline,assigned_user,completed_at').eq('family_id', State.fid).eq('project_id', projectId).order('deadline', { ascending: true }).limit(6),
    sb.from('project_activities').select('id,activity_type,description,activity_date,cost,created_by').eq('project_id', projectId).order('activity_date', { ascending: false }).limit(6),
    sb.from('expenses').select('id,amount,description,created_at').eq('family_id', State.fid).eq('project_id', projectId).order('created_at', { ascending: false }).limit(6),
  ]);

  if (projectError || memberError || projectMembersError || taskError || activityError || expenseError) {
    console.error('[Projects] Failed to load project detail:', projectError || memberError || projectMembersError || taskError || activityError || expenseError);
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

  ProjectsPage.membersById = Object.fromEntries((members || []).map((member) => [member.id, member]));
  const teamRows = (projectMembers || []).map((row) => ({
    ...row,
    member: ProjectsPage.membersById[row.user_id] || null,
  }));
  const leader = teamRows.find((row) => row.role === 'leader');
  const leaderName = leader?.member?.full_name || ProjectsPage.membersById[project.created_by]?.full_name || 'Unassigned';
  const totalSpent = (expenses || []).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const budget = Number(project.budget || 0);
  const remaining = budget - totalSpent;
  const openTasks = (tasks || []).filter((task) => task.status !== 'completed').length;
  const completedTasks = (tasks || []).filter((task) => task.status === 'completed').length;

  setTopbar(project.name, `
    <button class="btn btn-sm" onclick="backToProjects()">Back to Projects</button>
    ${project.project_type === 'farming' ? `<button class="btn btn-primary btn-sm" onclick="nav('farming')">Open Farm Manager</button>` : ''}
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
          <div class="metric-label">Team Members</div>
          <div class="metric-value">${teamRows.length}</div>
          <div class="metric-sub">Leader: ${escapeHtml(leaderName)}</div>
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
          <div class="card-title">Team</div>
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
          <div class="card-title">Recent Tasks</div>
          ${(tasks || []).map((task) => `
            <div class="flex-between mb8" style="padding:10px;background:var(--bg3);border-radius:var(--radius-sm);">
              <div>
                <div style="font-size:13px;font-weight:600;">${escapeHtml(task.title)}</div>
                <div style="font-size:11px;color:var(--text3);">
                  ${task.assigned_user ? `Assigned: ${escapeHtml(ProjectsPage.membersById[task.assigned_user]?.full_name || 'Unknown')}` : 'Unassigned'}
                  ${task.deadline ? ` | Due: ${fmtDate(task.deadline)}` : ''}
                </div>
              </div>
              ${statusBadge(task.status)}
            </div>`).join('')}
          ${!(tasks || []).length ? empty('No tasks linked to this project yet') : ''}
          <button class="btn btn-sm" style="margin-top:8px;" onclick="nav('tasks')">Open Tasks</button>
        </div>

        <div class="card">
          <div class="card-title">Recent Activity</div>
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
          ${project.project_type === 'farming' ? `<button class="btn btn-sm" style="margin-top:8px;" onclick="nav('farming')">Open Farm Manager</button>` : ''}
        </div>
      </div>
    </div>`;
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
          <option value="">- Select -</option>
          ${(members || []).map((member) => `<option value="${member.id}">${escapeHtml(member.full_name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Start Date</label>
        <input id="p-start" class="form-input" type="date"/></div>
      <div class="form-group"><label class="form-label">End Date</label>
        <input id="p-end" class="form-input" type="date"/></div>
    </div>
    <p id="project-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Create', cls: 'btn-primary', fn: async () => {
    hideErr('project-err');
    const name = document.getElementById('p-name')?.value.trim() || '';
    if (!name) {
      showErr('project-err', 'Project name is required.');
      return;
    }

    const { data: project, error: createError } = await DB.client
      .from('projects')
      .insert({
        family_id: State.fid,
        name,
        description: document.getElementById('p-desc')?.value.trim() || null,
        project_type: document.getElementById('p-type')?.value || 'other',
        status: document.getElementById('p-status')?.value || 'planning',
        budget: parseFloat(document.getElementById('p-budget')?.value || '') || 0,
        start_date: document.getElementById('p-start')?.value || null,
        end_date: document.getElementById('p-end')?.value || null,
        created_by: State.uid,
      })
      .select()
      .single();

    if (createError || !project) {
      showErr('project-err', createError?.message || 'Unable to create project.');
      return;
    }

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

Router.register('projects', renderProjects);
Router.register('project-detail', renderProjectDetail);
