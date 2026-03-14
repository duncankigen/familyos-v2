/**
 * js/pages/finance.js
 * ─────────────────────────────────────────────────────
 * Finance overview: wallet balance by type, payment accounts.
 */

function canManageFinanceAccounts() {
  return ['admin', 'treasurer'].includes(State.currentProfile?.role);
}

async function fetchFinanceSummary(fid) {
  return FinanceCore.fetchCashSummary(fid);
}

async function renderFinance() {
  setTopbar('Finance Overview');
  const fid = State.fid;

  const [{ data: contrib, error: contribError }, { data: accounts, error: accountsError }, { data: schoolFees, error: schoolFeesError }, summary] = await Promise.all([
    DB.client.from('contributions').select('amount,contribution_type').eq('family_id', fid),
    DB.client.from('payment_accounts').select('*').eq('family_id', fid),
    DB.client.from('school_fees').select('student_id,total_fee,paid_amount').eq('family_id', fid),
    fetchFinanceSummary(fid),
  ]);

  if (contribError || accountsError || schoolFeesError) {
    console.error('[Finance] Failed to load:', contribError || accountsError || schoolFeesError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load the finance overview right now')}</div>
      </div>`;
    return;
  }

  const byType = {};
  (contrib || []).forEach((item) => {
    byType[item.contribution_type] = (byType[item.contribution_type] || 0) + Number(item.amount);
  });
  const schoolFeeSummary = FinanceCore.buildSchoolFeeSummary(schoolFees || []);

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Balance</div>
          <div class="metric-value" style="color:var(--accent);">KES ${fmt(summary.balance)}</div>
          <div class="metric-sub">Contributions minus expenses</div></div>
        <div class="metric-card"><div class="metric-label">Total Contributions</div>
          <div class="metric-value" style="color:var(--success);">KES ${fmt(summary.total_contributions)}</div>
          <div class="metric-sub">This month KES ${fmt(summary.this_month_contributions)}</div></div>
        <div class="metric-card"><div class="metric-label">Total Expenses</div>
          <div class="metric-value" style="color:var(--danger);">KES ${fmt(summary.total_expenses)}</div>
          <div class="metric-sub">This month KES ${fmt(summary.this_month_expenses)}</div></div>
        <div class="metric-card"><div class="metric-label">Emergency Fund</div>
          <div class="metric-value" style="color:var(--warning);">KES ${fmt(summary.emergency_fund_balance)}</div>
          <div class="metric-sub">Current reserve balance</div></div>
      </div>

      <div class="g2 mb16">
        <div class="metric-card"><div class="metric-label">Outstanding School Fees</div>
          <div class="metric-value" style="color:var(--danger);">KES ${fmt(schoolFeeSummary.outstanding)}</div>
          <div class="metric-sub">Across all active fee records</div></div>
        <div class="metric-card"><div class="metric-label">Students With Balance</div>
          <div class="metric-value">${schoolFeeSummary.unpaidStudents}</div>
          <div class="metric-sub">Need follow-up on school fees</div></div>
      </div>

      <div class="g2 mb16">
        <div class="card">
          <div class="card-title">Contributions by Type</div>
          ${Object.entries(byType).map(([key, value]) => `
            <div class="mb12">
              <div class="flex-between mb8">
                <span style="font-size:13px;text-transform:capitalize;">${key}</span>
                <span style="font-size:13px;font-weight:600;">KES ${fmt(value)}</span>
              </div>
              <div class="progress">
                <div class="progress-fill" style="width:${summary.total_contributions ? Math.round(value / summary.total_contributions * 100) : 0}%;background:var(--accent);"></div>
              </div>
            </div>`).join('')}
          ${!Object.keys(byType).length ? empty('No contributions yet') : ''}
        </div>

        <div class="card">
          <div class="card-title">Payment Accounts</div>
          ${(accounts || []).map((account) => `
            <div style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;">
              <div class="flex-between">
                <span style="font-size:13px;font-weight:600;">${account.name}</span>
                <span class="badge b-blue">${account.account_type}</span>
              </div>
              <div style="font-size:12px;color:var(--text2);margin-top:3px;">
                ${account.account_number || ''} ${account.reference_note ? '· ' + account.reference_note : ''}
              </div>
            </div>`).join('')}
          ${!(accounts || []).length ? empty('No accounts') : ''}
          ${canManageFinanceAccounts() ? `<button class="btn btn-sm" onclick="openAddAccount()" style="margin-top:6px;">+ Add Account</button>` : ''}
        </div>
      </div>
    </div>`;
}

function openAddAccount() {
  if (!canManageFinanceAccounts()) return;

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
    <p id="account-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{
    label: 'Save',
    cls: 'btn-primary',
    fn: savePaymentAccount,
  }]);
}

async function savePaymentAccount() {
  hideErr('account-err');

  const name = document.getElementById('acc-name')?.value.trim() || '';
  if (!name) {
    showErr('account-err', 'Account name is required.');
    return;
  }

  const { error } = await DB.client.from('payment_accounts').insert({
    family_id: State.fid,
    name,
    account_type: document.getElementById('acc-type')?.value || 'other',
    account_number: document.getElementById('acc-num')?.value.trim() || null,
    reference_note: document.getElementById('acc-ref')?.value.trim() || null,
  });

  if (error) {
    showErr('account-err', error.message);
    return;
  }

  Modal.close();
  renderPage('finance');
}

Router.register('finance', renderFinance);
