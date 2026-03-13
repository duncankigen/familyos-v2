/**
 * js/pages/contributions.js
 * ─────────────────────────────────────────────────────
 * Record and view all family contributions.
 */

async function renderContributions() {
  setTopbar('Contributions', `<button class="btn btn-primary btn-sm" onclick="openAddContrib()">+ Record</button>`);
  const { data } = await DB.client
    .from('contributions')
    .select('*,users(full_name)')
    .eq('family_id', State.fid)
    .order('created_at', { ascending: false })
    .limit(100);

  const total = (data || []).reduce((a, b) => a + Number(b.amount), 0);

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card">
          <div class="metric-label">Total Contributions</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(total)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Records</div>
          <div class="metric-value">${(data || []).length}</div>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Member</th><th>Amount</th><th>Type</th><th>Reference</th><th>Date</th></tr>
            </thead>
            <tbody>
              ${(data || []).map(c => `
                <tr>
                  <td><div class="flex gap8">${avatarHtml(c.users?.full_name || '?', 'av-sm')} ${c.users?.full_name || 'Unknown'}</div></td>
                  <td><strong style="color:var(--success);">KES ${fmt(c.amount)}</strong></td>
                  <td><span class="badge b-blue">${c.contribution_type}</span></td>
                  <td style="color:var(--text2);font-size:12px;">${c.reference || '—'}</td>
                  <td style="color:var(--text3);font-size:12px;">${fmtDate(c.created_at)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!(data || []).length ? empty('No contributions recorded yet') : ''}
      </div>
    </div>`;
}

function openAddContrib() {
  Modal.open('Record Contribution', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Amount (KES)</label>
        <input id="c-amount" class="form-input" type="number" placeholder="5000"/>
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <select id="c-type" class="form-select">
          <option value="general">General</option>
          <option value="project">Project</option>
          <option value="fees">School Fees</option>
          <option value="emergency">Emergency</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Reference (optional)</label>
      <input id="c-ref" class="form-input" placeholder="e.g. Monthly contribution"/>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <input id="c-notes" class="form-input" placeholder="Additional notes"/>
    </div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    const amount = parseFloat(document.getElementById('c-amount').value);
    if (!amount || amount <= 0) return;
    await DB.client.from('contributions').insert({
      family_id:         State.fid,
      user_id:           State.uid,
      amount,
      contribution_type: document.getElementById('c-type').value,
      reference:         document.getElementById('c-ref').value,
      notes:             document.getElementById('c-notes').value,
    });
    Modal.close();
    renderPage('contributions');
  }}]);
}

Router.register('contributions', renderContributions);
