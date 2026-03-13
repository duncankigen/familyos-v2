/**
 * js/pages/emergency.js
 * ─────────────────────────────────────────────────────
 * Emergency fund: balance vs target, disbursement history.
 */

async function renderEmergency() {
  setTopbar('Emergency Fund', `<button class="btn btn-primary btn-sm" onclick="openAddDisbursement()">+ Record Disbursement</button>`);
  const sb = DB.client;

  const [{ data: ef }, { data: disb }] = await Promise.all([
    sb.from('emergency_fund').select('*').eq('family_id', State.fid).single(),
    sb.from('emergency_disbursements').select('*').eq('family_id', State.fid).order('created_at', { ascending: false }),
  ]);

  const cur = ef?.current_amount || 0;
  const tar = ef?.target_amount  || 300000;
  const pct = Math.min(100, Math.round(cur / tar * 100));

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Current Balance</div>
          <div class="metric-value" style="color:var(--accent);">KES ${fmt(cur)}</div></div>
        <div class="metric-card"><div class="metric-label">Target</div>
          <div class="metric-value">KES ${fmt(tar)}</div></div>
        <div class="metric-card"><div class="metric-label">Progress</div>
          <div class="metric-value" style="color:var(--warning);">${pct}%</div></div>
        <div class="metric-card"><div class="metric-label">Total Disbursed</div>
          <div class="metric-value" style="color:var(--danger);">KES ${fmt(
            (disb || []).filter(d => d.status === 'disbursed').reduce((a, b) => a + Number(b.amount), 0)
          )}</div></div>
      </div>

      <div class="card mb16">
        <div class="card-title">Fund Progress</div>
        <div class="flex-between mb8">
          <span style="font-size:13px;">KES ${fmt(cur)} of KES ${fmt(tar)}</span>
          <span style="font-size:13px;font-weight:700;color:var(--warning);">${pct}%</span>
        </div>
        <div class="progress" style="height:10px;">
          <div class="progress-fill" style="width:${pct}%;background:var(--warning);"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-sm btn-primary" onclick="openUpdateFund()">Update Balance</button>
          <button class="btn btn-sm" onclick="openSetTarget()">Set Target</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Disbursement History</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Event</th><th>Member</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              ${(disb || []).map(d => `
                <tr>
                  <td>${d.event_description}</td>
                  <td>${d.member_name || '—'}</td>
                  <td><strong>KES ${fmt(d.amount)}</strong></td>
                  <td>${statusBadge(d.status)}</td>
                  <td style="font-size:12px;color:var(--text3);">${fmtDate(d.disbursed_at || d.created_at)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!(disb || []).length ? empty('No disbursements recorded') : ''}
      </div>
    </div>`;
}

function openUpdateFund() {
  Modal.open('Update Emergency Fund Balance', `
    <div class="form-group"><label class="form-label">New Balance (KES)</label>
      <input id="ef-bal" class="form-input" type="number" placeholder="180000"/></div>
  `, [{ label: 'Update', cls: 'btn-primary', fn: async () => {
    const amount = parseFloat(document.getElementById('ef-bal').value);
    if (isNaN(amount)) return;
    const { data: existing } = await DB.client.from('emergency_fund').select('id').eq('family_id', State.fid).single();
    if (existing) {
      await DB.client.from('emergency_fund').update({ current_amount: amount, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await DB.client.from('emergency_fund').insert({ family_id: State.fid, current_amount: amount });
    }
    Modal.close();
    renderPage('emergency');
  }}]);
}

function openSetTarget() {
  Modal.open('Set Emergency Fund Target', `
    <div class="form-group"><label class="form-label">Target Amount (KES)</label>
      <input id="ef-target" class="form-input" type="number" placeholder="300000"/></div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    const target = parseFloat(document.getElementById('ef-target').value);
    if (!target) return;
    const { data: existing } = await DB.client.from('emergency_fund').select('id').eq('family_id', State.fid).single();
    if (existing) await DB.client.from('emergency_fund').update({ target_amount: target }).eq('id', existing.id);
    Modal.close();
    renderPage('emergency');
  }}]);
}

function openAddDisbursement() {
  Modal.open('Record Disbursement', `
    <div class="form-group"><label class="form-label">Event / Reason</label>
      <input id="d-event"  class="form-input" placeholder="Medical emergency — John"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Member Affected</label>
        <input id="d-member" class="form-input" placeholder="John Otieno"/></div>
      <div class="form-group"><label class="form-label">Amount (KES)</label>
        <input id="d-amount" class="form-input" type="number" placeholder="50000"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Status</label>
        <select id="d-status" class="form-select">
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="disbursed">Disbursed</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Date</label>
        <input id="d-date" class="form-input" type="date"/></div>
    </div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    const amount = parseFloat(document.getElementById('d-amount').value);
    if (!amount) return;
    await DB.client.from('emergency_disbursements').insert({
      family_id:         State.fid,
      event_description: document.getElementById('d-event').value,
      member_name:       document.getElementById('d-member').value,
      amount,
      status:            document.getElementById('d-status').value,
      disbursed_at:      document.getElementById('d-date').value || null,
    });
    Modal.close();
    renderPage('emergency');
  }}]);
}

Router.register('emergency', renderEmergency);
