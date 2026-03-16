/**
 * js/pages/contributions.js
 * ─────────────────────────────────────────────────────
 * Record and view all family contributions.
 */

const ContributionsPage = {
  items: [],
  members: [],
  memberById: {},
  projects: [],
  projectById: {},
};

function canManageContributions() {
  return ['admin', 'treasurer'].includes(State.currentProfile?.role);
}

function contributionInputValue(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function contributionMemberName(userId) {
  return ContributionsPage.memberById[userId]?.full_name || 'Unknown';
}

function contributionProjectName(projectId) {
  return ContributionsPage.projectById[projectId]?.name || '';
}

function contributionTypeRequiresProject(type) {
  return (type || 'general') === 'project';
}

function contributionProjectField(contribution = null) {
  const selectedProjectId = contribution?.project_id || '';
  const isVisible = contributionTypeRequiresProject(contribution?.contribution_type);

  return `
    <div id="c-project-wrap" class="form-group" style="display:${isVisible ? 'block' : 'none'};">
      <label class="form-label">Project</label>
      <select id="c-project" class="form-select" ${ContributionsPage.projects.length ? '' : 'disabled'}>
        <option value="">${ContributionsPage.projects.length ? 'Select a project' : 'No projects available'}</option>
        ${ContributionsPage.projects.map((project) => `
          <option value="${project.id}" ${selectedProjectId === project.id ? 'selected' : ''}>${escapeHtml(project.name)}</option>
        `).join('')}
      </select>
      <div style="font-size:12px;color:var(--text3);margin-top:6px;">
        Link project contributions to the exact project they are funding.
      </div>
    </div>
  `;
}

function toggleContributionProjectField() {
  const type = document.getElementById('c-type')?.value || 'general';
  const wrap = document.getElementById('c-project-wrap');
  const input = document.getElementById('c-project');
  if (!wrap || !input) return;

  const shouldShow = contributionTypeRequiresProject(type);
  wrap.style.display = shouldShow ? 'block' : 'none';
  if (!shouldShow) input.value = '';
}

function contributionForm(contribution = null) {
  const canManage = canManageContributions();
  const selectedUserId = contribution?.user_id || State.uid;

  return `
    ${canManage ? `
      <div class="form-group">
        <label class="form-label">Member</label>
        <select id="c-user" class="form-select">
          ${ContributionsPage.members.map((member) => `
            <option value="${member.id}" ${selectedUserId === member.id ? 'selected' : ''}>${member.full_name}</option>
          `).join('')}
        </select>
      </div>` : ''}
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Amount (KES)</label>
        <input id="c-amount" class="form-input" type="number" placeholder="5000" value="${contributionInputValue(contribution?.amount)}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <select id="c-type" class="form-select" onchange="toggleContributionProjectField()">
          <option value="general" ${contribution?.contribution_type === 'general' || !contribution ? 'selected' : ''}>General</option>
          <option value="project" ${contribution?.contribution_type === 'project' ? 'selected' : ''}>Project</option>
          <option value="fees" ${contribution?.contribution_type === 'fees' ? 'selected' : ''}>School Fees</option>
          <option value="emergency" ${contribution?.contribution_type === 'emergency' ? 'selected' : ''}>Emergency</option>
        </select>
      </div>
    </div>
    ${contributionProjectField(contribution)}
    <div class="form-group">
      <label class="form-label">Reference (optional)</label>
      <input id="c-ref" class="form-input" placeholder="e.g. Monthly contribution" value="${contributionInputValue(contribution?.reference)}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <input id="c-notes" class="form-input" placeholder="Additional notes" value="${contributionInputValue(contribution?.notes)}"/>
    </div>
    <p id="contrib-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
}

async function renderContributions() {
  setTopbar('Contributions', `<button class="btn btn-primary btn-sm" onclick="openAddContrib()">+ Record</button>`);

  const [{ data, error }, { data: members, error: membersError }, { data: projects, error: projectsError }] = await Promise.all([
    DB.client
      .from('contributions')
      .select('id,family_id,user_id,project_id,amount,contribution_type,reference,notes,created_at')
      .eq('family_id', State.fid)
      .order('created_at', { ascending: false })
      .limit(100),
    DB.client
      .from('users')
      .select('id,full_name')
      .eq('family_id', State.fid)
      .order('full_name'),
    DB.client
      .from('projects')
      .select('id,name')
      .eq('family_id', State.fid)
      .order('name'),
  ]);

  if (error || membersError || projectsError) {
    console.error('[Contributions] Failed to load:', error || membersError || projectsError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load contributions right now')}</div>
      </div>`;
    return;
  }

  ContributionsPage.items = data || [];
  ContributionsPage.members = members || [];
  ContributionsPage.projects = projects || [];
  ContributionsPage.memberById = Object.fromEntries((ContributionsPage.members).map((member) => [member.id, member]));
  ContributionsPage.projectById = Object.fromEntries((ContributionsPage.projects).map((project) => [project.id, project]));

  const total = ContributionsPage.items.reduce((sum, item) => sum + Number(item.amount), 0);

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card">
          <div class="metric-label">Total Contributions</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(total)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Records</div>
          <div class="metric-value">${ContributionsPage.items.length}</div>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Member</th><th>Amount</th><th>Type</th><th>Reference</th><th>Date</th>${canManageContributions() ? '<th>Action</th>' : ''}</tr>
            </thead>
            <tbody>
              ${ContributionsPage.items.map((contribution) => `
                <tr>
                  <td><div class="flex gap8">${avatarHtml(contributionMemberName(contribution.user_id), 'av-sm')} ${contributionMemberName(contribution.user_id)}</div></td>
                  <td><strong style="color:var(--success);">KES ${fmt(contribution.amount)}</strong></td>
                  <td>
                    <div><span class="badge b-blue">${contribution.contribution_type}</span></div>
                    ${contribution.contribution_type === 'project'
                      ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">${escapeHtml(contributionProjectName(contribution.project_id) || 'Unassigned project')}</div>`
                      : ''}
                  </td>
                  <td style="color:var(--text2);font-size:12px;">${contribution.reference || '—'}</td>
                  <td style="color:var(--text3);font-size:12px;">${fmtDate(contribution.created_at)}</td>
                  ${canManageContributions() ? `<td><button class="btn btn-sm" onclick="openEditContrib('${contribution.id}')">Manage</button></td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!ContributionsPage.items.length ? empty('No contributions recorded yet') : ''}
      </div>
    </div>`;
}

function openAddContrib() {
  Modal.open('Record Contribution', contributionForm(), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: () => saveContribution(),
  }]);
}

function openEditContrib(contributionId) {
  if (!canManageContributions()) return;

  const contribution = ContributionsPage.items.find((item) => item.id === contributionId);
  if (!contribution) return;

  Modal.open('Manage Contribution', contributionForm(contribution), [{
    label: 'Save Changes',
    cls: 'btn-primary',
    fn: () => saveContribution(contribution.id),
  }]);
}

async function saveContribution(contributionId = null) {
  hideErr('contrib-err');

  const amount = parseFloat(document.getElementById('c-amount')?.value || '');
  if (!amount || amount <= 0) {
    showErr('contrib-err', 'Enter a valid amount greater than zero.');
    return;
  }

  const canManage = canManageContributions();
  const userId = canManage
    ? (document.getElementById('c-user')?.value || State.uid)
    : State.uid;
  const contributionType = document.getElementById('c-type')?.value || 'general';
  const projectId = document.getElementById('c-project')?.value || '';

  if (contributionTypeRequiresProject(contributionType) && !projectId) {
    showErr('contrib-err', 'Select the project this contribution is funding.');
    return;
  }

  const payload = {
    user_id: userId,
    amount,
    contribution_type: contributionType,
    project_id: contributionTypeRequiresProject(contributionType) ? projectId : null,
    reference: document.getElementById('c-ref')?.value.trim() || null,
    notes: document.getElementById('c-notes')?.value.trim() || null,
  };

  let error = null;
  if (contributionId) {
    ({ error } = await DB.client
      .from('contributions')
      .update(payload)
      .eq('id', contributionId));
  } else {
    ({ error } = await DB.client
      .from('contributions')
      .insert({
        family_id: State.fid,
        ...payload,
      }));
  }

  if (error) {
    showErr('contrib-err', error.message);
    return;
  }

  Modal.close();
  renderPage('contributions');
}

Router.register('contributions', renderContributions);
