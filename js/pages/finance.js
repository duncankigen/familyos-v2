/**
 * js/pages/finance.js
 * ─────────────────────────────────────────────────────
 * Finance overview: wallet balance by type, payment accounts.
 */

async function renderFinance() {
  setTopbar('Finance Overview');
  const sb  = DB.client;
  const fid = State.fid;

  const [{ data: contrib }, { data: exp }, { data: ef }, { data: accounts }] = await Promise.all([
    sb.from('contributions').select('amount,contribution_type').eq('family_id', fid),
    sb.from('expenses').select('amount,category').eq('family_id', fid),
    sb.from('emergency_fund').select('*').eq('family_id', fid).single(),
    sb.from('payment_accounts').select('*').eq('family_id', fid),
  ]);

  const totalC  = (contrib  || []).reduce((a, b) => a + Number(b.amount), 0);
  const totalE  = (exp      || []).reduce((a, b) => a + Number(b.amount), 0);
  const byType  = {};
  (contrib || []).forEach(c => { byType[c.contribution_type] = (byType[c.contribution_type] || 0) + Number(c.amount); });

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Balance</div>
          <div class="metric-value" style="color:var(--accent);">KES ${fmt(totalC - totalE)}</div></div>
        <div class="metric-card"><div class="metric-label">Total Contributions</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(totalC)}</div></div>
        <div class="metric-card"><div class="metric-label">Total Expenses</div>
          <div class="metric-value" style="color:var(--danger);">KES ${fmt(totalE)}</div></div>
        <div class="metric-card"><div class="metric-label">Emergency Fund</div>
          <div class="metric-value" style="color:var(--warning);">KES ${fmt(ef?.current_amount || 0)}</div></div>
      </div>

      <div class="g2 mb16">
        <div class="card">
          <div class="card-title">Contributions by Type</div>
          ${Object.entries(byType).map(([k, v]) => `
            <div class="mb12">
              <div class="flex-between mb8">
                <span style="font-size:13px;text-transform:capitalize;">${k}</span>
                <span style="font-size:13px;font-weight:600;">KES ${fmt(v)}</span>
              </div>
              <div class="progress">
                <div class="progress-fill" style="width:${totalC ? Math.round(v / totalC * 100) : 0}%;background:var(--accent);"></div>
              </div>
            </div>`).join('')}
          ${!Object.keys(byType).length ? empty('No contributions yet') : ''}
        </div>

        <div class="card">
          <div class="card-title">Payment Accounts</div>
          ${(accounts || []).map(a => `
            <div style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;">
              <div class="flex-between">
                <span style="font-size:13px;font-weight:600;">${a.name}</span>
                <span class="badge b-blue">${a.account_type}</span>
              </div>
              <div style="font-size:12px;color:var(--text2);margin-top:3px;">
                ${a.account_number || ''} ${a.reference_note ? '· ' + a.reference_note : ''}
              </div>
            </div>`).join('')}
          ${!(accounts || []).length ? empty('No accounts') : ''}
          <button class="btn btn-sm" onclick="openAddAccount()" style="margin-top:6px;">+ Add Account</button>
        </div>
      </div>
    </div>`;
}

function openAddAccount() {
  Modal.open('Add Payment Account', `
    <div class="form-group"><label class="form-label">Name</label>
      <input id="acc-name" class="form-input" placeholder="Alliance High School"/></div>
    <div class="form-group"><label class="form-label">Type</label>
      <select id="acc-type" class="form-select">
        <option value="mpesa_paybill">Mpesa Paybill</option>
        <option value="mpesa_till">Mpesa Till</option>
        <option value="bank">Bank Account</option>
        <option value="mobile_money">Mobile Money</option>
      </select></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Account Number</label>
        <input id="acc-num" class="form-input" placeholder="123456"/></div>
      <div class="form-group"><label class="form-label">Reference Note</label>
        <input id="acc-ref" class="form-input" placeholder="Student name"/></div>
    </div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    await DB.client.from('payment_accounts').insert({
      family_id:      State.fid,
      name:           document.getElementById('acc-name').value,
      account_type:   document.getElementById('acc-type').value,
      account_number: document.getElementById('acc-num').value,
      reference_note: document.getElementById('acc-ref').value,
    });
    Modal.close(); renderPage('finance');
  }}]);
}

Router.register('finance', renderFinance);
