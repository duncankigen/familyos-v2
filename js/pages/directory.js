/**
 * js/pages/directory.js
 * Trusted vendors, suppliers, and service providers.
 */

const DirectoryPage = {
  vendors: [],
};

function canManageVendors() {
  return ['admin', 'project_manager'].includes(State.currentProfile?.role);
}

function vendorForm(vendor = null) {
  return `
    <div class="form-group"><label class="form-label">Business Name</label>
      <input id="v-name" class="form-input" placeholder="Farmer's Choice Agrovet" value="${escapeHtml(vendor?.name || '')}"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Category</label>
        <select id="v-cat" class="form-select">
          ${['seeds', 'hardware', 'transport', 'labor', 'equipment', 'services', 'other'].map((value) => `
            <option value="${value}" ${vendor?.category === value ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>
          `).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Phone</label>
        <input id="v-phone" class="form-input" placeholder="0712 345 678" value="${escapeHtml(vendor?.phone || '')}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Email</label>
        <input id="v-email" class="form-input" type="email" placeholder="vendor@example.com" value="${escapeHtml(vendor?.email || '')}"/></div>
      <div class="form-group"><label class="form-label">Rate</label>
        <input id="v-rate" class="form-input" type="number" placeholder="0" value="${vendor?.rate ?? ''}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Rate Unit</label>
        <input id="v-rate-unit" class="form-input" placeholder="per day, per bag, per trip" value="${escapeHtml(vendor?.rate_unit || '')}"/></div>
      <div class="form-group"><label class="form-label">Rating (1-5)</label>
        <input id="v-rating" class="form-input" type="number" min="1" max="5" placeholder="Optional" value="${vendor?.rating ?? ''}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Total Jobs</label>
        <input id="v-jobs" class="form-input" type="number" min="0" placeholder="0" value="${vendor?.total_jobs ?? ''}"/></div>
      <div class="form-group"><label class="form-label">Total Paid (KES)</label>
        <input id="v-paid" class="form-input" type="number" min="0" placeholder="0" value="${vendor?.total_paid ?? ''}"/></div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <textarea id="v-notes" class="form-textarea" placeholder="Trusted supplier, payment terms, work quality...">${escapeHtml(vendor?.notes || '')}</textarea></div>
    <p id="vendor-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
}

async function renderDirectory() {
  setTopbar('Vendor Directory', canManageVendors() ? `<button class="btn btn-primary btn-sm" onclick="openAddVendor()">+ Add Vendor</button>` : '');
  const { data: vendors, error } = await DB.client
    .from('vendors')
    .select('*')
    .eq('family_id', State.fid)
    .order('category');

  if (error) {
    console.error('[Directory] Failed to load vendors:', error);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load vendors right now')}</div>
      </div>`;
    return;
  }

  DirectoryPage.vendors = vendors || [];

  const grouped = {};
  DirectoryPage.vendors.forEach((vendor) => {
    if (!grouped[vendor.category]) grouped[vendor.category] = [];
    grouped[vendor.category].push(vendor);
  });

  const catColor = {
    hardware: 'b-amber',
    seeds: 'b-green',
    transport: 'b-blue',
    labor: 'b-purple',
    equipment: 'b-gray',
    services: 'b-blue',
    other: 'b-gray',
  };

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Vendors</div>
          <div class="metric-value">${DirectoryPage.vendors.length}</div></div>
        <div class="metric-card"><div class="metric-label">Categories</div>
          <div class="metric-value">${Object.keys(grouped).length}</div></div>
      </div>

      ${Object.entries(grouped).map(([cat, list]) => `
        <div class="mb16">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">
            ${escapeHtml(cat)} (${list.length})
          </div>
          <div class="g3">
            ${list.map((vendor) => `
              <div class="card">
                <div class="flex-between mb8">
                  <div style="font-size:14px;font-weight:700;">${escapeHtml(vendor.name)}</div>
                  <span class="badge ${catColor[vendor.category] || 'b-gray'}">${escapeHtml(vendor.category)}</span>
                </div>
                ${vendor.phone ? `<div style="font-size:12px;color:var(--text2);">${escapeHtml(vendor.phone)}</div>` : ''}
                ${vendor.email ? `<div style="font-size:12px;color:var(--text2);">${escapeHtml(vendor.email)}</div>` : ''}
                ${(vendor.rate || vendor.rate_unit) ? `<div style="font-size:12px;color:var(--text2);">Rate: ${vendor.rate ? `KES ${fmt(vendor.rate)}` : '-'}${vendor.rate_unit ? ` / ${escapeHtml(vendor.rate_unit)}` : ''}</div>` : ''}
                ${(vendor.total_jobs || vendor.total_paid) ? `<div style="font-size:12px;color:var(--text2);">Jobs: ${fmt(vendor.total_jobs || 0)} | Paid: KES ${fmt(vendor.total_paid || 0)}</div>` : ''}
                ${vendor.rating ? `<div style="font-size:12px;color:var(--text2);">Rating: ${vendor.rating}/5</div>` : ''}
                ${vendor.notes ? `<div style="font-size:12px;color:var(--text3);margin-top:6px;">${escapeHtml(vendor.notes)}</div>` : ''}
                ${canManageVendors() ? `<button class="btn btn-sm" style="margin-top:10px;" onclick="openEditVendor('${vendor.id}')">Manage</button>` : ''}
              </div>`).join('')}
          </div>
        </div>`).join('')}

      ${!DirectoryPage.vendors.length ? `<div class="card">${empty('No vendors added yet')}</div>` : ''}
    </div>`;
}

function openAddVendor() {
  if (!canManageVendors()) return;
  Modal.open('Add Vendor', vendorForm(), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: async () => saveVendor(),
  }]);
}

function openEditVendor(vendorId) {
  if (!canManageVendors()) return;
  const vendor = DirectoryPage.vendors.find((item) => item.id === vendorId);
  if (!vendor) return;

  Modal.open('Manage Vendor', vendorForm(vendor), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: async () => saveVendor(vendorId),
  }]);
}

async function saveVendor(vendorId = null) {
  hideErr('vendor-err');
  const name = document.getElementById('v-name')?.value.trim() || '';
  if (!name) {
    showErr('vendor-err', 'Business name is required.');
    return;
  }

  const payload = {
    family_id: State.fid,
    name,
    category: document.getElementById('v-cat')?.value || 'other',
    phone: document.getElementById('v-phone')?.value.trim() || null,
    email: document.getElementById('v-email')?.value.trim() || null,
    rate: parseFloat(document.getElementById('v-rate')?.value || '') || null,
    rate_unit: document.getElementById('v-rate-unit')?.value.trim() || null,
    rating: parseInt(document.getElementById('v-rating')?.value || '', 10) || null,
    total_jobs: parseInt(document.getElementById('v-jobs')?.value || '', 10) || 0,
    total_paid: parseFloat(document.getElementById('v-paid')?.value || '') || 0,
    notes: document.getElementById('v-notes')?.value.trim() || null,
  };

  const query = vendorId
    ? DB.client.from('vendors').update(payload).eq('id', vendorId)
    : DB.client.from('vendors').insert(payload);

  const { error } = await query;
  if (error) {
    showErr('vendor-err', error.message);
    return;
  }

  Modal.close();
  renderPage('directory');
}

Router.register('directory', renderDirectory);
