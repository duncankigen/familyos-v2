/**
 * js/pages/directory.js
 * ─────────────────────────────────────────────────────
 * Trusted vendors, suppliers, and service providers.
 */

async function renderDirectory() {
  setTopbar('Vendor Directory', `<button class="btn btn-primary btn-sm" onclick="openAddVendor()">+ Add Vendor</button>`);
  const { data: vendors } = await DB.client
    .from('vendors')
    .select('*')
    .eq('family_id', State.fid)
    .order('category');

  // Group by category
  const grouped = {};
  (vendors || []).forEach(v => {
    if (!grouped[v.category]) grouped[v.category] = [];
    grouped[v.category].push(v);
  });

  const catColor = {
    hardware: 'b-amber', seeds: 'b-green', transport: 'b-blue',
    labor: 'b-purple', equipment: 'b-gray', services: 'b-blue', other: 'b-gray',
  };

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Vendors</div>
          <div class="metric-value">${(vendors || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">Categories</div>
          <div class="metric-value">${Object.keys(grouped).length}</div></div>
      </div>

      ${Object.entries(grouped).map(([cat, list]) => `
        <div class="mb16">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">
            ${cat} (${list.length})
          </div>
          <div class="g3">
            ${list.map(v => `
              <div class="card">
                <div class="flex-between mb8">
                  <div style="font-size:14px;font-weight:700;">${v.name}</div>
                  <span class="badge ${catColor[v.category] || 'b-gray'}">${v.category}</span>
                </div>
                ${v.contact_person ? `<div style="font-size:12px;color:var(--text2);">👤 ${v.contact_person}</div>` : ''}
                ${v.phone          ? `<div style="font-size:12px;color:var(--text2);">📞 ${v.phone}</div>` : ''}
                ${v.location       ? `<div style="font-size:12px;color:var(--text2);">📍 ${v.location}</div>` : ''}
                ${v.notes          ? `<div style="font-size:12px;color:var(--text3);margin-top:6px;">${v.notes}</div>` : ''}
              </div>`).join('')}
          </div>
        </div>`).join('')}

      ${!(vendors || []).length ? `<div class="card">${empty('No vendors added yet')}</div>` : ''}
    </div>`;
}

function openAddVendor() {
  Modal.open('Add Vendor', `
    <div class="form-group"><label class="form-label">Business Name</label>
      <input id="v-name" class="form-input" placeholder="Farmer's Choice Agrovet"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Category</label>
        <select id="v-cat" class="form-select">
          <option value="seeds">Seeds & Produce</option>
          <option value="hardware">Hardware</option>
          <option value="transport">Transport</option>
          <option value="labor">Labor</option>
          <option value="equipment">Equipment</option>
          <option value="services">Services</option>
          <option value="other">Other</option>
        </select></div>
      <div class="form-group"><label class="form-label">Location</label>
        <input id="v-loc" class="form-input" placeholder="Kitale Town"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Contact Person</label>
        <input id="v-contact" class="form-input" placeholder="John Kamau"/></div>
      <div class="form-group"><label class="form-label">Phone</label>
        <input id="v-phone" class="form-input" placeholder="0712 345 678"/></div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <textarea id="v-notes" class="form-textarea" placeholder="Trusted supplier, good prices for maize seed..."></textarea></div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    await DB.client.from('vendors').insert({
      family_id:      State.fid,
      name:           document.getElementById('v-name').value,
      category:       document.getElementById('v-cat').value,
      location:       document.getElementById('v-loc').value,
      contact_person: document.getElementById('v-contact').value,
      phone:          document.getElementById('v-phone').value,
      notes:          document.getElementById('v-notes').value,
    });
    Modal.close(); renderPage('directory');
  }}]);
}

Router.register('directory', renderDirectory);
