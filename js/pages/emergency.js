/**
 * js/pages/emergency.js
 * ─────────────────────────────────────────────────────
 * Emergency fund: balance vs target, disbursement history.
 */

function canManageEmergencyFund() {
  return ['admin', 'treasurer'].includes(State.currentProfile?.role);
}

async function getEmergencyFundRecord() {
  const { data, error } = await DB.client
    .from('emergency_fund')
    .select('*')
    .eq('family_id', State.fid)
    .maybeSingle();

  return { data, error };
}

async function upsertEmergencyFund(values) {
  const { data: existing, error: existingError } = await getEmergencyFundRecord();
  if (existingError) return { error: existingError };

  if (existing?.id) {
    return DB.client
      .from('emergency_fund')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  }

  return DB.client
    .from('emergency_fund')
    .insert({
      family_id: State.fid,
      ...values,
      updated_at: new Date().toISOString(),
    });
}

async function renderEmergency() {
  setTopbar(
    'Emergency Fund',
    canManageEmergencyFund()
      ? `<button class="btn btn-primary btn-sm" onclick="openAddDisbursement()">+ Record Disbursement</button>`
      : ''
  );

  const sb = DB.client;
  const [{ data: ef, error: fundError }, { data: disb, error: disbError }] = await Promise.all([
    sb.from('emergency_fund').select('*').eq('family_id', State.fid).maybeSingle(),
    sb.from('emergency_disbursements').select('*').eq('family_id', State.fid).order('created_at', { ascending: false }),
  ]);

  if (fundError || disbError) {
    console.error('[Emergency] Failed to load:', fundError || disbError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load the emergency fund right now')}</div>
      </div>`;
    return;
  }

  const cur = ef?.current_amount || 0;
  const tar = ef?.target_amount || 300000;
  const pct = tar > 0 ? Math.min(100, Math.round(cur / tar * 100)) : 0;
  const totalDisbursed = (disb || [])
    .filter((item) => item.status === 'disbursed')
    .reduce((sum, item) => sum + Number(item.amount), 0);

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
          <div class="metric-value" style="color:var(--danger);">KES ${fmt(totalDisbursed)}</div></div>
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
        ${canManageEmergencyFund() ? `
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-sm btn-primary" onclick="openUpdateFund()">Update Balance</button>
            <button class="btn btn-sm" onclick="openSetTarget()">Set Target</button>
          </div>` : ''}
      </div>

      <div class="card">
        <div class="card-title">Disbursement History</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Event</th><th>Member</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              ${(disb || []).map((item) => `
                <tr>
                  <td>${item.event_description}</td>
                  <td>${item.member_name || '—'}</td>
                  <td><strong>KES ${fmt(item.amount)}</strong></td>
                  <td>${statusBadge(item.status)}</td>
                  <td style="font-size:12px;color:var(--text3);">${fmtDate(item.disbursed_at || item.created_at)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!(disb || []).length ? empty('No disbursements recorded') : ''}
      </div>
    </div>`;
}

function openUpdateFund() {
  if (!canManageEmergencyFund()) return;

  Modal.open('Update Emergency Fund Balance', `
    <div class="form-group"><label class="form-label">New Balance (KES)</label>
      <input id="ef-bal" class="form-input" type="number" placeholder="180000"/></div>
    <p id="emergency-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{
    label: 'Update',
    cls: 'btn-primary',
    fn: saveEmergencyBalance,
  }]);
}

async function saveEmergencyBalance() {
  hideErr('emergency-err');

  const amount = parseFloat(document.getElementById('ef-bal')?.value || '');
  if (isNaN(amount) || amount < 0) {
    showErr('emergency-err', 'Enter a valid balance.');
    return;
  }

  const { error } = await upsertEmergencyFund({ current_amount: amount });
  if (error) {
    showErr('emergency-err', error.message);
    return;
  }

  Modal.close();
  renderPage('emergency');
}

function openSetTarget() {
  if (!canManageEmergencyFund()) return;

  Modal.open('Set Emergency Fund Target', `
    <div class="form-group"><label class="form-label">Target Amount (KES)</label>
      <input id="ef-target" class="form-input" type="number" placeholder="300000"/></div>
    <p id="emergency-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{
    label: 'Save',
    cls: 'btn-primary',
    fn: saveEmergencyTarget,
  }]);
}

async function saveEmergencyTarget() {
  hideErr('emergency-err');

  const target = parseFloat(document.getElementById('ef-target')?.value || '');
  if (isNaN(target) || target <= 0) {
    showErr('emergency-err', 'Enter a valid target greater than zero.');
    return;
  }

  const { error } = await upsertEmergencyFund({ target_amount: target });
  if (error) {
    showErr('emergency-err', error.message);
    return;
  }

  Modal.close();
  renderPage('emergency');
}

function openAddDisbursement() {
  if (!canManageEmergencyFund()) return;

  Modal.open('Record Disbursement', `
    <div class="form-group"><label class="form-label">Event / Reason</label>
      <input id="d-event" class="form-input" placeholder="Medical emergency - John"/></div>
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
    <p id="emergency-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{
    label: 'Save',
    cls: 'btn-primary',
    fn: saveEmergencyDisbursement,
  }]);
}

async function saveEmergencyDisbursement() {
  hideErr('emergency-err');

  const eventDescription = document.getElementById('d-event')?.value.trim() || '';
  const amount = parseFloat(document.getElementById('d-amount')?.value || '');

  if (!eventDescription) {
    showErr('emergency-err', 'Event or reason is required.');
    return;
  }

  if (!amount || amount <= 0) {
    showErr('emergency-err', 'Enter a valid amount greater than zero.');
    return;
  }

  const { error } = await DB.client.from('emergency_disbursements').insert({
    family_id: State.fid,
    event_description: eventDescription,
    member_name: document.getElementById('d-member')?.value.trim() || null,
    amount,
    status: document.getElementById('d-status')?.value || 'pending',
    disbursed_at: document.getElementById('d-date')?.value || null,
  });

  if (error) {
    showErr('emergency-err', error.message);
    return;
  }

  Modal.close();
  renderPage('emergency');
}

Router.register('emergency', renderEmergency);
