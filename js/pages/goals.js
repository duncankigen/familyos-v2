/**
 * js/pages/goals.js
 * ─────────────────────────────────────────────────────
 * Family goal tracker with progress bars.
 */

async function renderGoals() {
  setTopbar('Family Goals', `<button class="btn btn-primary btn-sm" onclick="openAddGoal()">+ New Goal</button>`);
  const { data: goals } = await DB.client
    .from('family_goals')
    .select('*')
    .eq('family_id', State.fid)
    .order('created_at', { ascending: false });

  const active    = (goals || []).filter(g => g.status === 'active');
  const completed = (goals || []).filter(g => g.status === 'completed');

  const catColor = {
    construction: 'b-amber', education: 'b-blue',
    business: 'b-purple', emergency: 'b-red', investment: 'b-green', other: 'b-gray',
  };

  function goalCard(g) {
    const pct = Math.min(100, Math.round(g.current_amount / g.target_amount * 100));
    return `
      <div class="card">
        <div class="flex-between mb8">
          <span class="badge ${catColor[g.category] || 'b-gray'}">${g.category}</span>
          ${statusBadge(g.status)}
        </div>
        <div style="font-size:15px;font-weight:700;margin-bottom:4px;">${g.title}</div>
        ${g.description ? `<div style="font-size:12px;color:var(--text3);margin-bottom:10px;">${g.description}</div>` : ''}
        <div class="flex-between mb8">
          <span style="font-size:12px;color:var(--text2);">KES ${fmt(g.current_amount)} of KES ${fmt(g.target_amount)}</span>
          <span style="font-size:13px;font-weight:700;">${pct}%</span>
        </div>
        <div class="progress mb12">
          <div class="progress-fill" style="width:${pct}%;background:var(--accent);"></div>
        </div>
        ${g.deadline ? `<div style="font-size:11px;color:var(--text3);">Target date: ${fmtDate(g.deadline)}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button class="btn btn-sm btn-primary" onclick="openUpdateGoal('${g.id}', ${g.current_amount})">Update Progress</button>
          ${g.status !== 'completed' ? `<button class="btn btn-sm" onclick="markGoalComplete('${g.id}')">✓ Complete</button>` : ''}
        </div>
      </div>`;
  }

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Active Goals</div>
          <div class="metric-value" style="color:var(--accent);">${active.length}</div></div>
        <div class="metric-card"><div class="metric-label">Target Total</div>
          <div class="metric-value">KES ${fmt(active.reduce((a, b) => a + Number(b.target_amount), 0))}</div></div>
        <div class="metric-card"><div class="metric-label">Saved So Far</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(active.reduce((a, b) => a + Number(b.current_amount), 0))}</div></div>
        <div class="metric-card"><div class="metric-label">Completed</div>
          <div class="metric-value" style="color:var(--success);">${completed.length}</div></div>
      </div>

      ${active.length ? `<div class="g2 mb16">${active.map(goalCard).join('')}</div>` : `<div class="card mb16">${empty('No active goals — create your first')}</div>`}

      ${completed.length ? `
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Completed</div>
        <div class="g3">${completed.map(goalCard).join('')}</div>` : ''}
    </div>`;

  Sidebar.markSectionSeen('goals').catch((error) => {
    console.warn('[Goals] Failed to mark goals as seen:', error);
  });
}

function openAddGoal() {
  Modal.open('New Family Goal', `
    <div class="form-group"><label class="form-label">Goal Title</label>
      <input id="g-title" class="form-input" placeholder="Build family homestead"/></div>
    <div class="form-group"><label class="form-label">Description</label>
      <textarea id="g-desc" class="form-textarea" placeholder="Details about this goal..."></textarea></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Category</label>
        <select id="g-cat" class="form-select">
          <option value="construction">Construction</option>
          <option value="education">Education</option>
          <option value="business">Business</option>
          <option value="emergency">Emergency Fund</option>
          <option value="investment">Investment</option>
          <option value="other">Other</option>
        </select></div>
      <div class="form-group"><label class="form-label">Target Amount (KES)</label>
        <input id="g-target" class="form-input" type="number" placeholder="1000000"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Current Amount (KES)</label>
        <input id="g-current" class="form-input" type="number" placeholder="0"/></div>
      <div class="form-group"><label class="form-label">Target Date</label>
        <input id="g-dead" class="form-input" type="date"/></div>
    </div>
  `, [{ label: 'Create', cls: 'btn-primary', fn: async () => {
    const target = parseFloat(document.getElementById('g-target').value);
    if (!target) return;
    await DB.client.from('family_goals').insert({
      family_id:      State.fid,
      title:          document.getElementById('g-title').value,
      description:    document.getElementById('g-desc').value,
      category:       document.getElementById('g-cat').value,
      target_amount:  target,
      current_amount: parseFloat(document.getElementById('g-current').value) || 0,
      deadline:       document.getElementById('g-dead').value || null,
      status:         'active',
      created_by:     State.uid,
    });
    Modal.close(); renderPage('goals');
  }}]);
}

function openUpdateGoal(goalId, currentAmount) {
  Modal.open('Update Goal Progress', `
    <div class="form-group"><label class="form-label">New Current Amount (KES)</label>
      <input id="gup-amount" class="form-input" type="number" value="${currentAmount}"/></div>
  `, [{ label: 'Update', cls: 'btn-primary', fn: async () => {
    const amount = parseFloat(document.getElementById('gup-amount').value);
    if (isNaN(amount)) return;
    await DB.client.from('family_goals').update({ current_amount: amount }).eq('id', goalId);
    Modal.close(); renderPage('goals');
  }}]);
}

async function markGoalComplete(goalId) {
  await DB.client.from('family_goals').update({ status: 'completed' }).eq('id', goalId);
  renderPage('goals');
}

Router.register('goals', renderGoals);
