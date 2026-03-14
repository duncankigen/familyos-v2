/**
 * js/pages/assets.js
 * Family asset register: land, vehicles, equipment, property.
 */

const AssetsPage = {
  membersById: {},
};

function canManageAssets() {
  return ['admin', 'treasurer'].includes(State.currentProfile?.role);
}

function assetTypeIcon(type) {
  return {
    land: 'LAND',
    building: 'BLDG',
    vehicle: 'VEH',
    tractor: 'TRACT',
    livestock: 'LIVEST',
    equipment: 'EQPT',
    investment: 'INV',
    other: 'OTHER',
  }[type] || 'ASSET';
}

async function renderAssets() {
  setTopbar('Assets', canManageAssets() ? `<button class="btn btn-primary btn-sm" onclick="openAddAsset()">+ Add Asset</button>` : '');

  const [{ data: assets, error: assetError }, { data: members, error: memberError }] = await Promise.all([
    DB.client.from('assets').select('*').eq('family_id', State.fid).order('asset_type'),
    DB.client.from('users').select('id,full_name').eq('family_id', State.fid),
  ]);

  if (assetError || memberError) {
    console.error('[Assets] Failed to load:', assetError || memberError);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load assets right now')}</div>
      </div>`;
    return;
  }

  AssetsPage.membersById = Object.fromEntries((members || []).map((member) => [member.id, member]));

  const assetRows = assets || [];
  const totalValue = assetRows.reduce((sum, asset) => sum + Number(asset.estimated_value || 0), 0);

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Assets</div>
          <div class="metric-value">${assetRows.length}</div></div>
        <div class="metric-card"><div class="metric-label">Total Value</div>
          <div class="metric-value" style="color:var(--accent);">KES ${fmt(totalValue)}</div></div>
        <div class="metric-card"><div class="metric-label">Land</div>
          <div class="metric-value">${assetRows.filter((asset) => asset.asset_type === 'land').length}</div></div>
        <div class="metric-card"><div class="metric-label">Vehicles</div>
          <div class="metric-value">${assetRows.filter((asset) => asset.asset_type === 'vehicle').length}</div></div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Asset</th><th>Type</th><th>Location</th><th>Manager</th><th>Estimated Value</th><th>Monthly Income</th><th>Purchase Date</th></tr>
            </thead>
            <tbody>
              ${assetRows.map((asset) => `
                <tr>
                  <td>
                    <div style="font-weight:600;">${assetTypeIcon(asset.asset_type)} ${escapeHtml(asset.name || '-')}</div>
                    ${asset.notes ? `<div style="font-size:11px;color:var(--text3);">${escapeHtml(asset.notes.substring(0, 80))}</div>` : ''}
                  </td>
                  <td><span class="badge b-blue" style="text-transform:capitalize;">${escapeHtml(asset.asset_type || 'other')}</span></td>
                  <td style="font-size:12px;color:var(--text2);">${escapeHtml(asset.location || '-')}</td>
                  <td style="font-size:12px;">${escapeHtml(AssetsPage.membersById[asset.manager_id]?.full_name || '-')}</td>
                  <td>KES ${fmt(asset.estimated_value || 0)}</td>
                  <td style="color:var(--accent);font-weight:600;">${asset.monthly_income ? `KES ${fmt(asset.monthly_income)}` : '-'}</td>
                  <td>${asset.purchase_date ? fmtDate(asset.purchase_date) : '-'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!assetRows.length ? empty('No assets recorded yet') : ''}
      </div>
    </div>`;
}

async function openAddAsset() {
  if (!canManageAssets()) return;

  const { data: members, error } = await DB.client.from('users').select('id,full_name').eq('family_id', State.fid);
  if (error) {
    console.error('[Assets] Failed to load members:', error);
    return;
  }

  Modal.open('Add Asset', `
    <div class="form-group"><label class="form-label">Asset Name</label>
      <input id="a-name" class="form-input" placeholder="5-acre plot in Kitale"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Type</label>
        <select id="a-type" class="form-select">
          <option value="land">Land</option>
          <option value="building">Building</option>
          <option value="vehicle">Vehicle</option>
          <option value="tractor">Tractor</option>
          <option value="livestock">Livestock</option>
          <option value="equipment">Equipment</option>
          <option value="investment">Investment</option>
          <option value="other">Other</option>
        </select></div>
      <div class="form-group"><label class="form-label">Location</label>
        <input id="a-loc" class="form-input" placeholder="Kitale, Trans Nzoia"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Estimated Value (KES)</label>
        <input id="a-eval" class="form-input" type="number" placeholder="2500000"/></div>
      <div class="form-group"><label class="form-label">Monthly Income (KES)</label>
        <input id="a-income" class="form-input" type="number" placeholder="0"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Manager</label>
        <select id="a-mgr" class="form-select">
          <option value="">- None -</option>
          ${(members || []).map((member) => `<option value="${member.id}">${escapeHtml(member.full_name)}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Purchase Date</label>
        <input id="a-date" class="form-input" type="date"/></div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <textarea id="a-notes" class="form-textarea" placeholder="Registration, title deed, or management details..."></textarea></div>
    <p id="asset-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    hideErr('asset-err');
    const name = document.getElementById('a-name')?.value.trim() || '';
    if (!name) {
      showErr('asset-err', 'Asset name is required.');
      return;
    }

    const { error: insertError } = await DB.client.from('assets').insert({
      family_id: State.fid,
      name,
      asset_type: document.getElementById('a-type')?.value || 'other',
      location: document.getElementById('a-loc')?.value.trim() || null,
      estimated_value: parseFloat(document.getElementById('a-eval')?.value || '') || 0,
      monthly_income: parseFloat(document.getElementById('a-income')?.value || '') || 0,
      manager_id: document.getElementById('a-mgr')?.value || null,
      purchase_date: document.getElementById('a-date')?.value || null,
      notes: document.getElementById('a-notes')?.value.trim() || null,
    });

    if (insertError) {
      showErr('asset-err', insertError.message);
      return;
    }

    Modal.close();
    renderPage('assets');
  }}]);
}

Router.register('assets', renderAssets);
