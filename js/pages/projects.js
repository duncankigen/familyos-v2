/**
 * js/pages/projects.js
 * ─────────────────────────────────────────────────────
 * All family projects: farming, construction, business,
 * investment. Card grid with budget progress.
 */

const ProjectsPage = {
  projects: [],
  membersById: {},
  leadersByProject: {},
};

function canManageProjects() {
  return ['admin', 'project_manager'].includes(State.currentProfile?.role);
}

function projectLeaderName(project) {
  return ProjectsPage.leadersByProject[project.id]
    || ProjectsPage.membersById[project.created_by]?.full_name
    || 'Unassigned';
}

function openProjectCard(projectId) {
  const project = ProjectsPage.projects.find((item) => item.id === projectId);
  if (!project) return;
  if (project.project_type === 'farming') nav('farming');
}

async function renderProjects() {
  setTopbar(
    'Projects',
    canManageProjects() ? `<button class="btn btn-primary btn-sm" onclick="openAddProject()">+ New Project</button>` : ''
  );
  const sb = DB.client;

  const [{ data: projects, error: projectError }, { data: expenses, error: expenseError }, { data: members, error: memberError }] = await Promise.all([
    sb.from('projects').select('*').eq('family_id', State.fid).order('created_at', { ascending: false }),
    sb.from('expenses').select('project_id,amount').eq('family_id', State.fid),
    sb.from('users').select('id,full_name').eq('family_id', State.fid),
  ]);

  if (projectError || expenseError || memberError) {
    console.error('[Projects] Failed to load:', projectError || expenseError || memberError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load projects right now')}</div>
      </div>`;
    return;
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

  const expMap = {};
  (expenses || []).forEach((expense) => {
    expMap[expense.project_id] = (expMap[expense.project_id] || 0) + Number(expense.amount);
  });

  const typeColor = { farming: 'b-green', construction: 'b-amber', business: 'b-blue', investment: 'b-purple', other: 'b-gray' };

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Projects</div>
          <div class="metric-value">${ProjectsPage.projects.length}</div></div>
        <div class="metric-card"><div class="metric-label">Active</div>
          <div class="metric-value" style="color:var(--success);">${ProjectsPage.projects.filter((project) => project.status === 'active').length}</div></div>
        <div class="metric-card"><div class="metric-label">Total Budget</div>
          <div class="metric-value">KES ${fmt(ProjectsPage.projects.reduce((sum, project) => sum + Number(project.budget || 0), 0))}</div></div>
        <div class="metric-card"><div class="metric-label">Total Spent</div>
          <div class="metric-value" style="color:var(--warning);">KES ${fmt(Object.values(expMap).reduce((sum, amount) => sum + amount, 0))}</div></div>
      </div>

      <div class="g3">
        ${ProjectsPage.projects.map((project) => {
          const spent = expMap[project.id] || 0;
          const budget = Number(project.budget || 0);
          const pct = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0;
          const isFarming = project.project_type === 'farming';
          return `
            <div class="card" style="${isFarming ? 'cursor:pointer;' : ''}" ${isFarming ? `onclick="openProjectCard('${project.id}')"` : ''}>
              <div class="flex-between mb8">
                <span class="badge ${typeColor[project.project_type] || 'b-gray'}">${project.project_type}</span>
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
      ${!ProjectsPage.projects.length ? `<div class="card">${empty('No projects yet — create your first one')}</div>` : ''}
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
          <option value="">— Select —</option>
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
    renderPage('projects');
  }}]);
}

Router.register('projects', renderProjects);
