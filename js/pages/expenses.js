/**
 * js/pages/expenses.js
 * ─────────────────────────────────────────────────────
 * Record and view all family expenses, linked to projects
 * and vendors.
 */

async function renderExpenses() {
  setTopbar('Expenses', `<button class="btn btn-primary btn-sm" onclick="openAddExpense()">+ Record</button>`);
  const { data } = await DB.client
    .from('expenses')
    .select('*,projects(name),vendors(name),users(full_name)')
    .eq('family_id', State.fid)
    .order('created_at', { ascending: false })
    .limit(100);

  const total = (data || []).reduce((a, b) => a + Number(b.amount), 0);

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card">
          <div class="metric-label">Total Expenses</div>
          <div class="metric-value" style="color:var(--danger);">KES ${fmt(total)}</div>
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
              <tr><th>Description</th><th>Project</th><th>Vendor</th><th>Category</th><th>Amount</th><th>Date</th></tr>
            </thead>
            <tbody>
              ${(data || []).map(e => `
                <tr>
                  <td style="font-size:13px;">${e.description}</td>
                  <td>${e.projects ? `<span class="badge b-blue">${e.projects.name}</span>` : '<span style="color:var(--text3);">—</span>'}</td>
                  <td style="font-size:12px;color:var(--text2);">${e.vendors?.name || '—'}</td>
                  <td><span class="badge b-gray">${e.category}</span></td>
                  <td><strong style="color:var(--danger);">KES ${fmt(e.amount)}</strong></td>
                  <td style="color:var(--text3);font-size:12px;">${fmtDate(e.created_at)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!(data || []).length ? empty('No expenses recorded yet') : ''}
      </div>
    </div>`;
}

async function openAddExpense() {
  const sb = DB.client;
  const [{ data: projects }, { data: vendors }] = await Promise.all([
    sb.from('projects').select('id,name').eq('family_id', State.fid).eq('status', 'active'),
    sb.from('vendors').select('id,name').eq('family_id', State.fid),
  ]);

  Modal.open('Record Expense', `
    <div class="form-group">
      <label class="form-label">Description</label>
      <input id="e-desc" class="form-input" placeholder="Fertilizer purchase"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Amount (KES)</label>
        <input id="e-amount" class="form-input" type="number" placeholder="5000"/>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="e-cat" class="form-select">
          <option value="materials">Materials</option>
          <option value="labor">Labor</option>
          <option value="transport">Transport</option>
          <option value="equipment">Equipment</option>
          <option value="services">Services</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Project</label>
        <select id="e-proj" class="form-select">
          <option value="">— None —</option>
          ${(projects || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Vendor</label>
        <select id="e-vendor" class="form-select">
          <option value="">— None —</option>
          ${(vendors || []).map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
        </select>
      </div>
    </div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    const amount = parseFloat(document.getElementById('e-amount').value);
    if (!amount || amount <= 0) return;
    await DB.client.from('expenses').insert({
      family_id:   State.fid,
      amount,
      description: document.getElementById('e-desc').value,
      category:    document.getElementById('e-cat').value,
      project_id:  document.getElementById('e-proj').value   || null,
      vendor_id:   document.getElementById('e-vendor').value || null,
      created_by:  State.uid,
    });
    Modal.close();
    renderPage('expenses');
  }}]);
}

Router.register('expenses', renderExpenses);
