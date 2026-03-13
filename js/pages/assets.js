/**
 * js/pages/assets.js
 * ─────────────────────────────────────────────────────
 * Family asset register: land, vehicles, equipment, property.
 */

async function renderAssets() {
  setTopbar('Assets', `<button class="btn btn-primary btn-sm" onclick="openAddAsset()">+ Add Asset</button>`);
  const { data: assets } = await DB.client
    .from('assets')
    .select('*,users(full_name)')
    .eq('family_id', State.fid)
    .order('asset_type');

  const totalValue = (assets || []).reduce((a, b) => a + Number(b.current_value || b.purchase_value || 0), 0);

  const typeIcon = {
    land: '🌍', vehicle: '🚗', equipment: '⚙️',
    property: '🏠', livestock: '🐄', other: '📦',
  };

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Assets</div>
          <div class="metric-value">${(assets || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">Total Value</div>
          <div class="metric-value" style="color:var(--accent);">KES ${fmt(totalValue)}</div></div>
        <div class="metric-card"><div class="metric-label">Land</div>
          <div class="metric-value">${(assets || []).filter(a => a.asset_type === 'land').length}</div></div>
        <div class="metric-card"><div class="metric-label">Vehicles</div>
          <div class="metric-value">${(assets || []).filter(a => a.asset_type === 'vehicle').length}</div></div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Asset</th><th>Type</th><th>Location</th><th>Custodian</th><th>Purchase Value</th><th>Current Value</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${(assets || []).map(a => `
                <tr>
                  <td>
                    <div style="font-weight:600;">${typeIcon[a.asset_type] || '📦'} ${a.name}</div>
                    ${a.description ? `<div style="font-size:11px;color:var(--text3);">${a.description.substring(0, 50)}</div>` : ''}
                  </td>
                  <td><span class="badge b-blue" style="text-transform:capitalize;">${a.asset_type}</span></td>
                  <td style="font-size:12px;color:var(--text2);">${a.location || '—'}</td>
                  <td style="font-size:12px;">${a.users?.full_name || '—'}</td>
                  <td>KES ${fmt(a.purchase_value || 0)}</td>
                  <td style="color:var(--accent);font-weight:600;">KES ${fmt(a.current_value || a.purchase_value || 0)}</td>
                  <td>${statusBadge(a.status || 'active')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!(assets || []).length ? empty('No assets recorded yet') : ''}
      </div>
    </div>`;
}

async function openAddAsset() {
  const { data: members } = await DB.client.from('users').select('id,full_name').eq('family_id', State.fid);

  Modal.open('Add Asset', `
    <div class="form-group"><label class="form-label">Asset Name</label>
      <input id="a-name" class="form-input" placeholder="5-acre plot in Kitale"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Type</label>
        <select id="a-type" class="form-select">
          <option value="land">Land</option>
          <option value="property">Property</option>
          <option value="vehicle">Vehicle</option>
          <option value="equipment">Equipment</option>
          <option value="livestock">Livestock</option>
          <option value="other">Other</option>
        </select></div>
      <div class="form-group"><label class="form-label">Location</label>
        <input id="a-loc" class="form-input" placeholder="Kitale, Trans Nzoia"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Purchase Value (KES)</label>
        <input id="a-pval" class="form-input" type="number" placeholder="2000000"/></div>
      <div class="form-group"><label class="form-label">Current Value (KES)</label>
        <input id="a-cval" class="form-input" type="number" placeholder="2500000"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Custodian</label>
        <select id="a-cust" class="form-select">
          <option value="">— None —</option>
          ${(members || []).map(m => `<option value="${m.id}">${m.full_name}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Acquisition Date</label>
        <input id="a-date" class="form-input" type="date"/></div>
    </div>
    <div class="form-group"><label class="form-label">Description</label>
      <textarea id="a-desc" class="form-textarea" placeholder="Title deed no., registration, details..."></textarea></div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    await DB.client.from('assets').insert({
      family_id:        State.fid,
      name:             document.getElementById('a-name').value,
      asset_type:       document.getElementById('a-type').value,
      location:         document.getElementById('a-loc').value,
      purchase_value:   parseFloat(document.getElementById('a-pval').value) || 0,
      current_value:    parseFloat(document.getElementById('a-cval').value) || 0,
      custodian_id:     document.getElementById('a-cust').value || null,
      acquisition_date: document.getElementById('a-date').value || null,
      description:      document.getElementById('a-desc').value,
      status:           'active',
    });
    Modal.close(); renderPage('assets');
  }}]);
}

Router.register('assets', renderAssets);
