/**
 * js/pages/goals.js
 * ─────────────────────────────────────────────────────
 * Family goal tracker with progress bars.
 */

function canManageGoals() {
  return ['admin', 'treasurer'].includes(State.currentProfile?.role);
}

async function renderGoals() {
  setTopbar('Family Goals', canManageGoals() ? `<button class="btn btn-primary btn-sm" onclick="openAddGoal()">+ New Goal</button>` : '');
  const { data: goals, error } = await DB.client
    .from('family_goals')
    .select('*')
    .eq('family_id', State.fid)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Goals] Failed to load:', error);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load goals right now')}</div>
      </div>`;
    return;
  }

  const active = (goals || []).filter((goal) => goal.status === 'active');
  const achieved = (goals || []).filter((goal) => goal.status === 'achieved');
  const outstanding = active.reduce((sum, goal) => sum + Math.max(0, Number(goal.target_amount || 0) - Number(goal.current_amount || 0)), 0);

  function goalCard(goal) {
    const currentAmount = Number(goal.current_amount || 0);
    const targetAmount = Number(goal.target_amount || 0);
    const pct = targetAmount ? Math.min(100, Math.round(currentAmount / targetAmount * 100)) : 0;
    return `
      <div class="card">
        <div class="flex-between mb8">
          <span style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;">Family Goal</span>
          ${statusBadge(goal.status)}
        </div>
        <div style="font-size:15px;font-weight:700;margin-bottom:4px;">${escapeHtml(goal.title)}</div>
        ${goal.description ? `<div style="font-size:12px;color:var(--text3);margin-bottom:10px;">${escapeHtml(goal.description)}</div>` : ''}
        <div class="flex-between mb8">
          <span style="font-size:12px;color:var(--text2);">KES ${fmt(currentAmount)} of KES ${fmt(targetAmount)}</span>
          <span style="font-size:13px;font-weight:700;">${pct}%</span>
        </div>
        <div class="progress mb12">
          <div class="progress-fill" style="width:${pct}%;background:var(--accent);"></div>
        </div>
        ${goal.deadline ? `<div style="font-size:11px;color:var(--text3);">Target date: ${fmtDate(goal.deadline)}</div>` : ''}
        ${canManageGoals() ? `
          <div style="display:flex;gap:6px;margin-top:10px;">
            <button class="btn btn-sm btn-primary" onclick="openUpdateGoal('${goal.id}', ${currentAmount})">Update Progress</button>
            ${goal.status !== 'achieved' ? `<button class="btn btn-sm" onclick="markGoalAchieved('${goal.id}')">Mark Achieved</button>` : ''}
          </div>` : ''}
      </div>`;
  }

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Active Goals</div>
          <div class="metric-value" style="color:var(--accent);">${active.length}</div></div>
        <div class="metric-card"><div class="metric-label">Target Total</div>
          <div class="metric-value">KES ${fmt(active.reduce((sum, goal) => sum + Number(goal.target_amount || 0), 0))}</div></div>
        <div class="metric-card"><div class="metric-label">Saved So Far</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(active.reduce((sum, goal) => sum + Number(goal.current_amount || 0), 0))}</div></div>
        <div class="metric-card"><div class="metric-label">Outstanding</div>
          <div class="metric-value" style="color:var(--warning);">KES ${fmt(outstanding)}</div></div>
      </div>

      ${active.length ? `<div class="g2 mb16">${active.map(goalCard).join('')}</div>` : `<div class="card mb16">${empty('No active goals — create your first')}</div>`}

      ${achieved.length ? `
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Achieved</div>
        <div class="g3">${achieved.map(goalCard).join('')}</div>` : ''}
    </div>`;

  Sidebar.markSectionSeen('goals').catch((markError) => {
    console.warn('[Goals] Failed to mark goals as seen:', markError);
  });
}

function openAddGoal() {
  if (!canManageGoals()) return;
  Modal.open('New Family Goal', `
    <div class="form-group"><label class="form-label">Goal Title</label>
      <input id="g-title" class="form-input" placeholder="Build family homestead"/></div>
    <div class="form-group"><label class="form-label">Description</label>
      <textarea id="g-desc" class="form-textarea" placeholder="Details about this goal..."></textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Target Amount (KES)</label>
        <input id="g-target" class="form-input" type="number" placeholder="1000000"/></div>
      <div class="form-group"><label class="form-label">Current Amount (KES)</label>
        <input id="g-current" class="form-input" type="number" placeholder="0"/></div>
    </div>
    <div class="form-group"><label class="form-label">Target Date</label>
      <input id="g-dead" class="form-input" type="date"/></div>
    <p id="goal-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Create', cls: 'btn-primary', fn: async () => {
    hideErr('goal-err');
    const title = document.getElementById('g-title')?.value.trim() || '';
    const target = parseFloat(document.getElementById('g-target')?.value || '');
    if (!title || !target) {
      showErr('goal-err', 'Goal title and target amount are required.');
      return;
    }

    const { error } = await DB.client.from('family_goals').insert({
      family_id: State.fid,
      title,
      description: document.getElementById('g-desc')?.value.trim() || null,
      target_amount: target,
      current_amount: parseFloat(document.getElementById('g-current')?.value || '') || 0,
      deadline: document.getElementById('g-dead')?.value || null,
      status: 'active',
    });

    if (error) {
      showErr('goal-err', error.message);
      return;
    }

    Modal.close();
    renderPage('goals');
  }}]);
}

function openUpdateGoal(goalId, currentAmount) {
  if (!canManageGoals()) return;
  Modal.open('Update Goal Progress', `
    <div class="form-group"><label class="form-label">New Current Amount (KES)</label>
      <input id="gup-amount" class="form-input" type="number" value="${currentAmount}"/></div>
    <p id="goal-update-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Update', cls: 'btn-primary', fn: async () => {
    hideErr('goal-update-err');
    const amount = parseFloat(document.getElementById('gup-amount')?.value || '');
    if (isNaN(amount)) {
      showErr('goal-update-err', 'Enter a valid amount.');
      return;
    }

    const { error } = await DB.client.from('family_goals').update({ current_amount: amount }).eq('id', goalId);
    if (error) {
      showErr('goal-update-err', error.message);
      return;
    }

    Modal.close();
    renderPage('goals');
  }}]);
}

async function markGoalAchieved(goalId) {
  if (!canManageGoals()) return;
  const { error } = await DB.client.from('family_goals').update({ status: 'achieved' }).eq('id', goalId);
  if (error) {
    alert(error.message || 'Unable to update this goal right now.');
    return;
  }
  renderPage('goals');
}

Router.register('goals', renderGoals);
