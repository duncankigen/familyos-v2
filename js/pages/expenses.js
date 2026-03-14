/**
 * js/pages/expenses.js
 * ─────────────────────────────────────────────────────
 * Record and view all family expenses, linked to projects
 * and vendors.
 */

const ExpensesPage = {
  items: [],
  projects: [],
  vendors: [],
  expandedIds: new Set(),
};

function canCreateExpenses() {
  return ['admin', 'treasurer', 'project_manager'].includes(State.currentProfile?.role);
}

function canManageExpenses() {
  return ['admin', 'treasurer'].includes(State.currentProfile?.role);
}

function expenseInputValue(value) {
  return escapeHtml(value);
}

function expenseProjectName(projectId) {
  return ExpensesPage.projects.find((project) => project.id === projectId)?.name || null;
}

function expenseVendorName(vendorId) {
  return ExpensesPage.vendors.find((vendor) => vendor.id === vendorId)?.name || null;
}

function expenseAttachmentLink(expense) {
  if (!expense.receipt_url) return '';
  const label = escapeHtml(expense.attachment_name || 'View attachment');
  return `<a class="details-link" href="${expense.receipt_url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function expenseDetailsMarkup(expense) {
  return `
    <div class="details-panel">
      <div class="details-grid">
        <div>
          <div class="details-label">Reference</div>
          <div class="details-value">${expense.reference ? escapeHtml(expense.reference) : '—'}</div>
        </div>
        <div>
          <div class="details-label">Attachment</div>
          <div class="details-value">${expense.receipt_url ? expenseAttachmentLink(expense) : '—'}</div>
        </div>
      </div>
      <div style="margin-top:10px;">
        <div class="details-label">Notes</div>
        <div class="details-value">${expense.notes ? escapeHtml(expense.notes) : 'No notes added.'}</div>
      </div>
    </div>
  `;
}

function expenseForm(expense = null) {
  return `
    <div class="form-group">
      <label class="form-label">Description</label>
      <input id="e-desc" class="form-input" placeholder="Fertilizer purchase" value="${expenseInputValue(expense?.description)}"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Amount (KES)</label>
        <input id="e-amount" class="form-input" type="number" placeholder="5000" value="${expenseInputValue(expense?.amount)}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="e-cat" class="form-select">
          <option value="materials" ${expense?.category === 'materials' || !expense ? 'selected' : ''}>Materials</option>
          <option value="labor" ${expense?.category === 'labor' ? 'selected' : ''}>Labor</option>
          <option value="transport" ${expense?.category === 'transport' ? 'selected' : ''}>Transport</option>
          <option value="equipment" ${expense?.category === 'equipment' ? 'selected' : ''}>Equipment</option>
          <option value="services" ${expense?.category === 'services' ? 'selected' : ''}>Services</option>
          <option value="other" ${expense?.category === 'other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Project</label>
        <select id="e-proj" class="form-select">
          <option value="">— None —</option>
          ${ExpensesPage.projects.map((project) => `
            <option value="${project.id}" ${expense?.project_id === project.id ? 'selected' : ''}>${project.name}</option>
          `).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Vendor</label>
        <select id="e-vendor" class="form-select">
          <option value="">— None —</option>
          ${ExpensesPage.vendors.map((vendor) => `
            <option value="${vendor.id}" ${expense?.vendor_id === vendor.id ? 'selected' : ''}>${vendor.name}</option>
          `).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Reference (optional)</label>
      <input id="e-ref" class="form-input" placeholder="Invoice number / M-Pesa ref" value="${expenseInputValue(expense?.reference)}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Notes (optional)</label>
      <textarea id="e-notes" class="form-textarea" placeholder="More detail about this expense">${expenseInputValue(expense?.notes)}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Attachment (optional)</label>
      <input id="e-attachment" class="form-input" type="file" accept="image/*,.pdf,.doc,.docx"/>
      ${expense?.receipt_url ? `<div style="font-size:12px;color:var(--text3);margin-top:6px;">Current: ${expenseAttachmentLink(expense)}</div>` : ''}
    </div>
    <p id="expense-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
}

function toggleExpenseDetails(expenseId) {
  if (ExpensesPage.expandedIds.has(expenseId)) {
    ExpensesPage.expandedIds.delete(expenseId);
  } else {
    ExpensesPage.expandedIds.add(expenseId);
  }
  renderPage('expenses');
}

async function renderExpenses() {
  setTopbar(
    'Expenses',
    canCreateExpenses() ? `<button class="btn btn-primary btn-sm" onclick="openAddExpense()">+ Record</button>` : ''
  );

  const [{ data, error }, { data: projects, error: projectsError }, { data: vendors, error: vendorsError }] = await Promise.all([
    DB.client
      .from('expenses')
      .select('id,family_id,project_id,vendor_id,amount,category,description,receipt_url,reference,notes,attachment_name,created_by,created_at')
      .eq('family_id', State.fid)
      .order('created_at', { ascending: false })
      .limit(100),
    DB.client
      .from('projects')
      .select('id,name')
      .eq('family_id', State.fid)
      .order('name'),
    DB.client
      .from('vendors')
      .select('id,name')
      .eq('family_id', State.fid)
      .order('name'),
  ]);

  if (error || projectsError || vendorsError) {
    console.error('[Expenses] Failed to load:', error || projectsError || vendorsError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load expenses right now')}</div>
      </div>`;
    return;
  }

  ExpensesPage.items = data || [];
  ExpensesPage.projects = projects || [];
  ExpensesPage.vendors = vendors || [];

  const total = ExpensesPage.items.reduce((sum, item) => sum + Number(item.amount), 0);

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card">
          <div class="metric-label">Total Expenses</div>
          <div class="metric-value" style="color:var(--danger);">KES ${fmt(total)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Records</div>
          <div class="metric-value">${ExpensesPage.items.length}</div>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Description</th><th>Project</th><th>Vendor</th><th>Category</th><th>Amount</th><th>Date</th>${canManageExpenses() ? '<th>Action</th>' : ''}</tr>
            </thead>
            <tbody>
              ${ExpensesPage.items.map((expense) => `
                <tr class="record-row" onclick="toggleExpenseDetails('${expense.id}')">
                  <td style="font-size:13px;">
                    <div>${escapeHtml(expense.description)}</div>
                    <a class="details-toggle" href="#" onclick="event.preventDefault();event.stopPropagation();toggleExpenseDetails('${expense.id}')">
                      ${ExpensesPage.expandedIds.has(expense.id) ? 'Hide details' : 'View details'}
                    </a>
                  </td>
                  <td>${expenseProjectName(expense.project_id) ? `<span class="badge b-blue">${escapeHtml(expenseProjectName(expense.project_id))}</span>` : '<span style="color:var(--text3);">—</span>'}</td>
                  <td style="font-size:12px;color:var(--text2);">${expenseVendorName(expense.vendor_id) ? escapeHtml(expenseVendorName(expense.vendor_id)) : '—'}</td>
                  <td><span class="badge b-gray">${escapeHtml(expense.category)}</span></td>
                  <td><strong style="color:var(--danger);">KES ${fmt(expense.amount)}</strong></td>
                  <td style="color:var(--text3);font-size:12px;">${fmtDate(expense.created_at)}</td>
                  ${canManageExpenses() ? `<td><button class="btn btn-sm" onclick="event.stopPropagation();openEditExpense('${expense.id}')">Manage</button></td>` : ''}
                </tr>
                ${ExpensesPage.expandedIds.has(expense.id) ? `
                  <tr class="details-row">
                    <td colspan="${canManageExpenses() ? 7 : 6}">
                      ${expenseDetailsMarkup(expense)}
                    </td>
                  </tr>` : ''}
              `).join('')}
            </tbody>
          </table>
        </div>
        ${!ExpensesPage.items.length ? empty('No expenses recorded yet') : ''}
      </div>
    </div>`;
}

function openAddExpense() {
  if (!canCreateExpenses()) return;

  Modal.open('Record Expense', expenseForm(), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: () => saveExpense(),
  }]);
}

function openEditExpense(expenseId) {
  if (!canManageExpenses()) return;

  const expense = ExpensesPage.items.find((item) => item.id === expenseId);
  if (!expense) return;

  Modal.open('Manage Expense', expenseForm(expense), [{
    label: 'Save Changes',
    cls: 'btn-primary',
    fn: () => saveExpense(expense.id),
  }]);
}

async function saveExpense(expenseId = null) {
  hideErr('expense-err');

  const amount = parseFloat(document.getElementById('e-amount')?.value || '');
  const description = document.getElementById('e-desc')?.value.trim() || '';

  if (!description) {
    showErr('expense-err', 'Description is required.');
    return;
  }

  if (!amount || amount <= 0) {
    showErr('expense-err', 'Enter a valid amount greater than zero.');
    return;
  }

  const file = document.getElementById('e-attachment')?.files?.[0] || null;
  let attachmentPayload = {};
  if (file) {
    const upload = await uploadFinanceAttachment(file, 'expenses');
    if (upload.error) {
      showErr('expense-err', upload.error.message || 'Unable to upload attachment.');
      return;
    }
    attachmentPayload = {
      receipt_url: upload.url,
      attachment_name: upload.name,
    };
  }

  const payload = {
    amount,
    description,
    category: document.getElementById('e-cat')?.value || 'other',
    project_id: document.getElementById('e-proj')?.value || null,
    vendor_id: document.getElementById('e-vendor')?.value || null,
    reference: document.getElementById('e-ref')?.value.trim() || null,
    notes: document.getElementById('e-notes')?.value.trim() || null,
    ...attachmentPayload,
  };

  let error = null;
  if (expenseId) {
    ({ error } = await DB.client
      .from('expenses')
      .update(payload)
      .eq('id', expenseId));
  } else {
    ({ error } = await DB.client
      .from('expenses')
      .insert({
        family_id: State.fid,
        created_by: State.uid,
        ...payload,
      }));
  }

  if (error) {
    showErr('expense-err', error.message);
    return;
  }

  Modal.close();
  renderPage('expenses');
}

Router.register('expenses', renderExpenses);
