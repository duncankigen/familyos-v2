/**
 * js/pages/finance.js
 * ─────────────────────────────────────────────────────
 * Finance overview: wallet balance by type, payment accounts.
 */

const FinancePage = {
  accounts: [],
};

function canManageFinanceAccounts() {
  return ['admin', 'treasurer'].includes(State.currentProfile?.role);
}

function financeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function financeInputValue(value) {
  return financeText(value || '');
}

function financeAccountTypeLabel(type) {
  return String(type || 'other').replace(/_/g, ' ');
}

function financeAccountById(accountId) {
  return FinancePage.accounts.find((account) => account.id === accountId) || null;
}

function financeAccountMenu(accountId) {
  if (!canManageFinanceAccounts()) return '';

  return `
    <details class="admin-menu" onclick="event.stopPropagation()">
      <summary class="admin-menu-toggle" title="Manage account">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="8" r="1.4"></circle>
          <circle cx="8" cy="8" r="1.4"></circle>
          <circle cx="13" cy="8" r="1.4"></circle>
        </svg>
      </summary>
      <div class="admin-menu-pop">
        <button class="admin-menu-item" onclick="event.preventDefault();event.stopPropagation();openEditAccount('${accountId}')">Edit account</button>
        <button class="admin-menu-item" style="color:var(--danger);" onclick="event.preventDefault();event.stopPropagation();confirmDeletePaymentAccount('${accountId}')">Delete account</button>
      </div>
    </details>`;
}

function paymentAccountForm(account = null) {
  return `
    <div class="form-group"><label class="form-label">Name</label>
      <input id="acc-name" class="form-input" placeholder="Alliance High School" value="${financeInputValue(account?.name)}"/></div>
    <div class="form-group"><label class="form-label">Type</label>
      <select id="acc-type" class="form-select">
        <option value="mpesa_paybill" ${account?.account_type === 'mpesa_paybill' ? 'selected' : ''}>Mpesa Paybill</option>
        <option value="mpesa_till" ${account?.account_type === 'mpesa_till' ? 'selected' : ''}>Mpesa Till</option>
        <option value="bank" ${account?.account_type === 'bank' ? 'selected' : ''}>Bank Account</option>
        <option value="mobile_money" ${account?.account_type === 'mobile_money' ? 'selected' : ''}>Mobile Money</option>
        <option value="other" ${!account?.account_type || account?.account_type === 'other' ? 'selected' : ''}>Other</option>
      </select></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Account Number</label>
        <input id="acc-num" class="form-input" placeholder="123456" value="${financeInputValue(account?.account_number)}"/></div>
      <div class="form-group"><label class="form-label">Reference Note</label>
        <input id="acc-ref" class="form-input" placeholder="Student name" value="${financeInputValue(account?.reference_note)}"/></div>
    </div>
    <p id="account-err" style="color:var(--danger);font-size:12px;display:none;"></p>`;
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
  FinancePage.accounts = accounts || [];
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
              <div class="flex-between" style="align-items:flex-start;gap:10px;">
                <div style="min-width:0;flex:1;">
                  <div style="font-size:13px;font-weight:600;word-break:break-word;">${financeText(account.name)}</div>
                  <div style="font-size:12px;color:var(--text2);margin-top:3px;word-break:break-word;">
                    ${financeText(account.account_number || '')}${account.account_number && account.reference_note ? ' · ' : ''}${financeText(account.reference_note || '')}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                  <span class="badge b-blue">${financeText(financeAccountTypeLabel(account.account_type))}</span>
                  ${financeAccountMenu(account.id)}
                </div>
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

  Modal.open('Add Payment Account', paymentAccountForm(), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: () => savePaymentAccount(),
  }]);
}

function openEditAccount(accountId) {
  if (!canManageFinanceAccounts()) return;

  const account = financeAccountById(accountId);
  if (!account) return;

  Modal.open('Edit Payment Account', paymentAccountForm(account), [{
    label: 'Save Changes',
    cls: 'btn-primary',
    fn: () => savePaymentAccount(accountId),
  }]);
}

async function savePaymentAccount(accountId = null) {
  hideErr('account-err');

  const name = document.getElementById('acc-name')?.value.trim() || '';
  if (!name) {
    showErr('account-err', 'Account name is required.');
    return;
  }

  const payload = {
    name,
    account_type: document.getElementById('acc-type')?.value || 'other',
    account_number: document.getElementById('acc-num')?.value.trim() || null,
    reference_note: document.getElementById('acc-ref')?.value.trim() || null,
  };

  let error = null;
  if (accountId) {
    ({ error } = await DB.client.from('payment_accounts').update(payload).eq('id', accountId));
  } else {
    ({ error } = await DB.client.from('payment_accounts').insert({
      family_id: State.fid,
      ...payload,
    }));
  }

  if (error) {
    showErr('account-err', error.message);
    return;
  }

  Modal.close();
  renderPage('finance');
}

async function confirmDeletePaymentAccount(accountId) {
  if (!canManageFinanceAccounts()) return;

  const account = financeAccountById(accountId);
  if (!account) return;

  const { count, error } = await DB.client
    .from('school_fee_payments')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', State.fid)
    .eq('payment_account_id', accountId);

  const linkedCount = error ? 0 : (count || 0);
  const warning = linkedCount
    ? `This account is linked to ${linkedCount} school fee payment record(s). Deleting it will remove that account link from those records.`
    : 'This will permanently remove the account from your family workspace.';

  Modal.open('Delete Payment Account', `
    <div style="font-size:14px;line-height:1.55;color:var(--text);">
      <div style="font-weight:600;margin-bottom:6px;">${financeText(account.name)}</div>
      <div style="color:var(--text2);">${financeText(warning)}</div>
    </div>
    <p id="account-delete-err" style="color:var(--danger);font-size:12px;display:none;margin-top:10px;"></p>
  `, [
    { label: 'Cancel', cls: 'btn-ghost', fn: () => Modal.close() },
    {
      label: 'Delete Account',
      cls: 'btn-primary',
      fn: () => deletePaymentAccount(accountId),
    },
  ]);
}

async function deletePaymentAccount(accountId) {
  const { error } = await DB.client.from('payment_accounts').delete().eq('id', accountId);
  if (error) {
    showErr('account-delete-err', error.message);
    return;
  }

  Modal.close();
  renderPage('finance');
}

Router.register('finance', renderFinance);
