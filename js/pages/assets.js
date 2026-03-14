/**
 * js/pages/assets.js
 * Family asset register: land, vehicles, equipment, property.
 */

const AssetsPage = {
  membersById: {},
  assets: [],
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

function assetAttachmentMarkup(asset) {
  if (!asset?.attachment_url) return '';
  return `
    <div style="margin-top:8px;font-size:12px;">
      <a class="details-link" href="${asset.attachment_url}" target="_blank" rel="noopener noreferrer">
        View attachment${asset.attachment_name ? `: ${escapeHtml(asset.attachment_name)}` : ''}
      </a>
    </div>`;
}

function assetStatusBadge(status) {
  const tone = {
    active: 'b-green',
    inactive: 'b-amber',
    archived: 'b-gray',
  }[status || 'active'] || 'b-gray';
  return `<span class="badge ${tone}">${escapeHtml(status || 'active')}</span>`;
}

function assetForm(asset = null) {
  return `
    <div class="form-group"><label class="form-label">Asset Name</label>
      <input id="a-name" class="form-input" placeholder="5-acre plot in Kitale" value="${escapeHtml(asset?.name || '')}"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Type</label>
        <select id="a-type" class="form-select">
          ${['land', 'building', 'vehicle', 'tractor', 'livestock', 'equipment', 'investment', 'other'].map((value) => `
            <option value="${value}" ${asset?.asset_type === value ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>
          `).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Location</label>
        <input id="a-loc" class="form-input" placeholder="Kitale, Trans Nzoia" value="${escapeHtml(asset?.location || '')}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Estimated Value (KES)</label>
        <input id="a-eval" class="form-input" type="number" placeholder="2500000" value="${asset?.estimated_value ?? ''}"/></div>
      <div class="form-group"><label class="form-label">Monthly Income (KES)</label>
        <input id="a-income" class="form-input" type="number" placeholder="0" value="${asset?.monthly_income ?? ''}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Manager</label>
        <select id="a-mgr" class="form-select">
          <option value="">- None -</option>
          ${Object.values(AssetsPage.membersById).map((member) => `
            <option value="${member.id}" ${asset?.manager_id === member.id ? 'selected' : ''}>${escapeHtml(member.full_name)}</option>
          `).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Status</label>
        <select id="a-status" class="form-select">
          ${['active', 'inactive', 'archived'].map((value) => `
            <option value="${value}" ${asset?.status === value || (!asset && value === 'active') ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>
          `).join('')}
        </select></div>
    </div>
    <div class="form-group"><label class="form-label">Purchase Date</label>
      <input id="a-date" class="form-input" type="date" value="${asset?.purchase_date || ''}"/></div>
    <div class="form-group"><label class="form-label">Evidence / Document (optional)</label>
      <input id="a-file" class="form-input" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf" />
      ${asset?.attachment_url ? `
        <div style="margin-top:6px;font-size:12px;">
          <a class="details-link" href="${asset.attachment_url}" target="_blank" rel="noopener noreferrer">
            Current file${asset.attachment_name ? `: ${escapeHtml(asset.attachment_name)}` : ''}
          </a>
        </div>` : ''}
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <textarea id="a-notes" class="form-textarea" placeholder="Registration, title deed, or management details...">${escapeHtml(asset?.notes || '')}</textarea></div>
    <p id="asset-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
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

  AssetsPage.assets = assets || [];
  AssetsPage.membersById = Object.fromEntries((members || []).map((member) => [member.id, member]));

  const activeAssets = AssetsPage.assets.filter((asset) => (asset.status || 'active') === 'active');
  const totalValue = activeAssets.reduce((sum, asset) => sum + Number(asset.estimated_value || 0), 0);
  const incomeAssets = activeAssets.filter((asset) => Number(asset.monthly_income || 0) > 0).length;

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Assets</div>
          <div class="metric-value">${activeAssets.length}</div></div>
        <div class="metric-card"><div class="metric-label">Total Value</div>
          <div class="metric-value" style="color:var(--accent);">KES ${fmt(totalValue)}</div></div>
        <div class="metric-card"><div class="metric-label">Land</div>
          <div class="metric-value">${activeAssets.filter((asset) => asset.asset_type === 'land').length}</div></div>
        <div class="metric-card"><div class="metric-label">Income Assets</div>
          <div class="metric-value">${incomeAssets}</div></div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Asset</th><th>Type</th><th>Location</th><th>Manager</th><th>Estimated Value</th><th>Monthly Income</th><th>Purchase Date</th>${canManageAssets() ? '<th></th>' : ''}</tr>
            </thead>
            <tbody>
              ${AssetsPage.assets.map((asset) => `
                <tr>
                  <td>
                    <div style="font-weight:600;">${assetTypeIcon(asset.asset_type)} ${escapeHtml(asset.name || '-')}</div>
                    <div style="margin-top:6px;">${assetStatusBadge(asset.status || 'active')}</div>
                    ${asset.notes ? `<div style="font-size:11px;color:var(--text3);">${escapeHtml(asset.notes.substring(0, 80))}</div>` : ''}
                    ${assetAttachmentMarkup(asset)}
                  </td>
                  <td><span class="badge b-blue" style="text-transform:capitalize;">${escapeHtml(asset.asset_type || 'other')}</span></td>
                  <td style="font-size:12px;color:var(--text2);">${escapeHtml(asset.location || '-')}</td>
                  <td style="font-size:12px;">${escapeHtml(AssetsPage.membersById[asset.manager_id]?.full_name || '-')}</td>
                  <td>KES ${fmt(asset.estimated_value || 0)}</td>
                  <td style="color:var(--accent);font-weight:600;">${asset.monthly_income ? `KES ${fmt(asset.monthly_income)}` : '-'}</td>
                  <td>${asset.purchase_date ? fmtDate(asset.purchase_date) : '-'}</td>
                  ${canManageAssets() ? `<td><button class="btn btn-sm" onclick="openEditAsset('${asset.id}')">Manage</button></td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!AssetsPage.assets.length ? empty('No assets recorded yet') : ''}
      </div>
    </div>`;
}

function openAddAsset() {
  if (!canManageAssets()) return;

  Modal.open('Add Asset', assetForm(), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: async () => saveAsset(),
  }]);
}

function openEditAsset(assetId) {
  if (!canManageAssets()) return;
  const asset = AssetsPage.assets.find((item) => item.id === assetId);
  if (!asset) return;

  Modal.open('Manage Asset', assetForm(asset), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: async () => saveAsset(assetId),
  }]);
}

async function saveAsset(assetId = null) {
  hideErr('asset-err');
  const existingAsset = assetId ? AssetsPage.assets.find((item) => item.id === assetId) : null;
  const name = document.getElementById('a-name')?.value.trim() || '';
  if (!name) {
    showErr('asset-err', 'Asset name is required.');
    return;
  }

  let attachmentUrl = existingAsset?.attachment_url || null;
  let attachmentName = existingAsset?.attachment_name || null;
  const file = document.getElementById('a-file')?.files?.[0] || null;
  if (file) {
    const upload = await uploadFinanceAttachment(file, 'assets');
    if (upload?.error) {
      showErr('asset-err', upload.error.message || 'Attachment upload failed.');
      return;
    }
    attachmentUrl = upload.url;
    attachmentName = upload.name;
  }

  const payload = {
    family_id: State.fid,
    name,
    asset_type: document.getElementById('a-type')?.value || 'other',
    location: document.getElementById('a-loc')?.value.trim() || null,
    estimated_value: parseFloat(document.getElementById('a-eval')?.value || '') || 0,
    monthly_income: parseFloat(document.getElementById('a-income')?.value || '') || 0,
    manager_id: document.getElementById('a-mgr')?.value || null,
    status: document.getElementById('a-status')?.value || 'active',
    purchase_date: document.getElementById('a-date')?.value || null,
    notes: document.getElementById('a-notes')?.value.trim() || null,
    attachment_url: attachmentUrl,
    attachment_name: attachmentName,
  };

  const query = assetId
    ? DB.client.from('assets').update(payload).eq('id', assetId)
    : DB.client.from('assets').insert(payload);

  const { error } = await query;
  if (error) {
    showErr('asset-err', error.message);
    return;
  }

  Modal.close();
  renderPage('assets');
}

Router.register('assets', renderAssets);
