/**
 * js/pages/emergency.js
 * ─────────────────────────────────────────────────────
 * Emergency fund: balance vs target, disbursement history.
 */

const EmergencyPage = {
  disbursements: [],
  expandedIds: new Set(),
};

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

function emergencyInputValue(value) {
  return escapeHtml(value);
}

function emergencyDateValue(value) {
  return value ? String(value).split('T')[0] : '';
}

function emergencyAttachmentLink(item) {
  if (!item.attachment_url) return '';
  return `<a class="details-link" href="${item.attachment_url}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.attachment_name || 'View attachment')}</a>`;
}

function emergencyDetailsMarkup(item) {
  return `
    <div class="details-panel">
      <div class="details-grid">
        <div>
          <div class="details-label">Reference</div>
          <div class="details-value">${item.reference ? escapeHtml(item.reference) : '—'}</div>
        </div>
        <div>
          <div class="details-label">Attachment</div>
          <div class="details-value">${item.attachment_url ? emergencyAttachmentLink(item) : '—'}</div>
        </div>
      </div>
      <div style="margin-top:10px;">
        <div class="details-label">Notes</div>
        <div class="details-value">${item.notes ? escapeHtml(item.notes) : 'No notes added.'}</div>
      </div>
    </div>
  `;
}

function emergencyDisbursementForm(item = null) {
  return `
    <div class="form-group"><label class="form-label">Event / Reason</label>
      <input id="d-event" class="form-input" placeholder="Medical emergency - John" value="${emergencyInputValue(item?.event_description)}"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Member Affected</label>
        <input id="d-member" class="form-input" placeholder="John Otieno" value="${emergencyInputValue(item?.member_name)}"/></div>
      <div class="form-group"><label class="form-label">Amount (KES)</label>
        <input id="d-amount" class="form-input" type="number" placeholder="50000" value="${emergencyInputValue(item?.amount)}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Status</label>
        <select id="d-status" class="form-select">
          <option value="pending" ${item?.status === 'pending' || !item ? 'selected' : ''}>Pending Approval</option>
          <option value="approved" ${item?.status === 'approved' ? 'selected' : ''}>Approved</option>
          <option value="disbursed" ${item?.status === 'disbursed' ? 'selected' : ''}>Disbursed</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Date</label>
        <input id="d-date" class="form-input" type="date" value="${item?.disbursed_at ? emergencyDateValue(item.disbursed_at) : ''}"/></div>
    </div>
    <div class="form-group"><label class="form-label">Reference (optional)</label>
      <input id="d-ref" class="form-input" placeholder="Approval / transaction reference" value="${emergencyInputValue(item?.reference)}"/></div>
    <div class="form-group"><label class="form-label">Notes (optional)</label>
      <textarea id="d-notes" class="form-textarea" placeholder="Extra detail about the disbursement">${emergencyInputValue(item?.notes)}</textarea></div>
    <div class="form-group"><label class="form-label">Attachment (optional)</label>
      <input id="d-attachment" class="form-input" type="file" accept="image/*,.pdf,.doc,.docx"/>
      ${item?.attachment_url ? `<div style="font-size:12px;color:var(--text3);margin-top:6px;">Current: ${emergencyAttachmentLink(item)}</div>` : ''}
    </div>
    <p id="emergency-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
}

function toggleEmergencyDetails(id) {
  if (EmergencyPage.expandedIds.has(id)) EmergencyPage.expandedIds.delete(id);
  else EmergencyPage.expandedIds.add(id);
  renderPage('emergency');
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

  EmergencyPage.disbursements = disb || [];
  const cur = ef?.current_amount || 0;
  const tar = ef?.target_amount || 300000;
  const pct = tar > 0 ? Math.min(100, Math.round(cur / tar * 100)) : 0;
  const totalDisbursed = EmergencyPage.disbursements
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
            <thead><tr><th>Event</th><th>Member</th><th>Amount</th><th>Status</th><th>Date</th>${canManageEmergencyFund() ? '<th>Action</th>' : ''}</tr></thead>
            <tbody>
              ${EmergencyPage.disbursements.map((item) => `
                <tr class="record-row" onclick="toggleEmergencyDetails('${item.id}')">
                  <td>
                    <div>${escapeHtml(item.event_description)}</div>
                    <a class="details-toggle" href="#" onclick="event.preventDefault();event.stopPropagation();toggleEmergencyDetails('${item.id}')">
                      ${EmergencyPage.expandedIds.has(item.id) ? 'Hide details' : 'View details'}
                    </a>
                  </td>
                  <td>${item.member_name ? escapeHtml(item.member_name) : '—'}</td>
                  <td><strong>KES ${fmt(item.amount)}</strong></td>
                  <td>${statusBadge(item.status)}</td>
                  <td style="font-size:12px;color:var(--text3);">${fmtDate(item.disbursed_at || item.created_at)}</td>
                  ${canManageEmergencyFund() ? `<td><button class="btn btn-sm" onclick="event.stopPropagation();openEditDisbursement('${item.id}')">Manage</button></td>` : ''}
                </tr>
                ${EmergencyPage.expandedIds.has(item.id) ? `
                  <tr class="details-row">
                    <td colspan="${canManageEmergencyFund() ? 6 : 5}">
                      ${emergencyDetailsMarkup(item)}
                    </td>
                  </tr>` : ''}
              `).join('')}
            </tbody>
          </table>
        </div>
        ${!EmergencyPage.disbursements.length ? empty('No disbursements recorded') : ''}
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

  Modal.open('Record Disbursement', emergencyDisbursementForm(), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: saveEmergencyDisbursement,
  }]);
}

function openEditDisbursement(id) {
  if (!canManageEmergencyFund()) return;
  const item = EmergencyPage.disbursements.find((entry) => entry.id === id);
  if (!item) return;

  Modal.open('Manage Disbursement', emergencyDisbursementForm(item), [{
    label: 'Save Changes',
    cls: 'btn-primary',
    fn: () => saveEmergencyDisbursement(id),
  }]);
}

async function saveEmergencyDisbursement(disbursementId = null) {
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

  const file = document.getElementById('d-attachment')?.files?.[0] || null;
  let attachmentPayload = {};
  if (file) {
    const upload = await uploadFinanceAttachment(file, 'emergency');
    if (upload.error) {
      showErr('emergency-err', upload.error.message || 'Unable to upload attachment.');
      return;
    }
    attachmentPayload = {
      attachment_url: upload.url,
      attachment_name: upload.name,
    };
  }

  const payload = {
    event_description: eventDescription,
    member_name: document.getElementById('d-member')?.value.trim() || null,
    amount,
    status: document.getElementById('d-status')?.value || 'pending',
    disbursed_at: document.getElementById('d-date')?.value || null,
    reference: document.getElementById('d-ref')?.value.trim() || null,
    notes: document.getElementById('d-notes')?.value.trim() || null,
    ...attachmentPayload,
  };

  let error = null;
  if (disbursementId) {
    ({ error } = await DB.client
      .from('emergency_disbursements')
      .update(payload)
      .eq('id', disbursementId));
  } else {
    ({ error } = await DB.client.from('emergency_disbursements').insert({
      family_id: State.fid,
      ...payload,
    }));
  }

  if (error) {
    showErr('emergency-err', error.message);
    return;
  }

  Modal.close();
  renderPage('emergency');
}

Router.register('emergency', renderEmergency);
