/**
 * js/pages/vault.js
 * ─────────────────────────────────────────────────────
 * Family document vault with optional file upload.
 */

const VaultPage = {
  docs: [],
  search: '',
};

function canManageDocuments() {
  return ['admin', 'treasurer'].includes(State.currentProfile?.role);
}

function canEditDocument(document) {
  return State.currentProfile?.role === 'admin' || document?.uploaded_by === State.uid;
}

function documentIcon(category) {
  const iconMap = {
    land_title: 'TITLE',
    contract: 'DOC',
    certificate: 'CERT',
    medical: 'MED',
    financial: 'FIN',
    other: 'FILE',
  };
  return iconMap[category] || 'FILE';
}

function documentAccessBadge(accessLevel) {
  if (accessLevel === 'admins') return '<span class="badge b-red">Admins only</span>';
  if (accessLevel === 'all') return '<span class="badge b-blue">All access</span>';
  return '<span class="badge b-green">Members</span>';
}

async function uploadVaultFile(file) {
  if (!file) return { url: null, name: null, sizeKb: null };

  const bucket = 'documents';
  const ext = (file.name.split('.').pop() || 'file').toLowerCase();
  const base = safeFileName(file.name.replace(/\.[^.]+$/, ''));
  const path = `${State.fid || 'family'}/${Date.now()}-${base}.${ext}`;

  const { error: uploadError } = await DB.client.storage
    .from(bucket)
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadError) return { error: uploadError };

  const { data } = DB.client.storage.from(bucket).getPublicUrl(path);
  return {
    url: data?.publicUrl || null,
    name: file.name || null,
    sizeKb: Math.max(1, Math.round((file.size || 0) / 1024)),
  };
}

function vaultForm(document = null) {
  return `
    <div class="form-group"><label class="form-label">Document Title</label>
      <input id="d-title" class="form-input" placeholder="Title Deed — Kitale Plot 234" value="${escapeHtml(document?.title || '')}"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Category</label>
        <select id="d-category" class="form-select">
          ${[
            ['land_title', 'Land Title'],
            ['certificate', 'Certificate'],
            ['contract', 'Contract'],
            ['medical', 'Medical'],
            ['financial', 'Financial'],
            ['other', 'Other'],
          ].map(([value, label]) => `<option value="${value}" ${document?.category === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Access Level</label>
        <select id="d-access" class="form-select">
          <option value="members" ${document?.access_level === 'members' ? 'selected' : ''}>Members</option>
          <option value="all" ${document?.access_level === 'all' ? 'selected' : ''}>All</option>
          <option value="admins" ${document?.access_level === 'admins' ? 'selected' : ''}>Admins Only</option>
        </select></div>
    </div>
    <div class="form-group"><label class="form-label">Upload File (optional)</label>
      <input id="d-file" class="form-input" type="file"/></div>
    <div class="form-group"><label class="form-label">File URL (optional)</label>
      <input id="d-url" class="form-input" placeholder="https://..." value="${escapeHtml(document?.file_url || '')}"/></div>
    <div class="form-group"><label class="form-label">File Name (optional)</label>
      <input id="d-name" class="form-input" placeholder="title-deed.pdf" value="${escapeHtml(document?.file_name || '')}"/></div>
    <p id="vault-err" style="color:var(--danger);font-size:12px;display:none;"></p>
  `;
}

async function renderVault() {
  setTopbar('Vault', canManageDocuments() ? `<button class="btn btn-primary btn-sm" onclick="openAddDocument()">+ Add Document</button>` : '');
  const { data: docs, error } = await DB.client
    .from('documents')
    .select('*,users(full_name)')
    .eq('family_id', State.fid)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Vault] Failed to load:', error);
    document.getElementById('page-content').innerHTML = `
      <div class="content">
        <div class="card">${empty('Unable to load the vault right now')}</div>
      </div>`;
    return;
  }

  VaultPage.docs = docs || [];
  const query = VaultPage.search.trim().toLowerCase();
  const visibleDocs = VaultPage.docs.filter((doc) => {
    if (!query) return true;
    return [
      doc.title,
      doc.category,
      doc.file_name,
      doc.access_level,
      doc.users?.full_name,
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Documents</div>
          <div class="metric-value">${VaultPage.docs.length}</div></div>
        <div class="metric-card"><div class="metric-label">Land Titles</div>
          <div class="metric-value">${VaultPage.docs.filter((doc) => doc.category === 'land_title').length}</div></div>
        <div class="metric-card"><div class="metric-label">Certificates</div>
          <div class="metric-value">${VaultPage.docs.filter((doc) => doc.category === 'certificate').length}</div></div>
        <div class="metric-card"><div class="metric-label">Contracts</div>
          <div class="metric-value">${VaultPage.docs.filter((doc) => doc.category === 'contract').length}</div></div>
      </div>

      <div class="card">
        <div class="form-group mb12">
          <label class="form-label">Search Vault</label>
          <input class="form-input" placeholder="Search by title, category, file name, or member" value="${escapeHtml(VaultPage.search)}" oninput="setVaultSearch(this.value)"/>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Document</th><th>Category</th><th>Access</th><th>Added By</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              ${visibleDocs.map((doc) => `
                <tr>
                  <td>
                    <div style="font-weight:600;">${documentIcon(doc.category)} ${escapeHtml(doc.title)}</div>
                    ${doc.file_name ? `<div style="font-size:11px;color:var(--text3);">${escapeHtml(doc.file_name)}${doc.file_size_kb ? ` · ${fmt(doc.file_size_kb)} KB` : ''}</div>` : ''}
                  </td>
                  <td><span class="badge b-blue">${escapeHtml((doc.category || 'other').replace('_', ' '))}</span></td>
                  <td>${documentAccessBadge(doc.access_level)}</td>
                  <td style="font-size:12px;">${escapeHtml(doc.users?.full_name || '—')}</td>
                  <td style="font-size:12px;color:var(--text3);">${fmtDate(doc.created_at)}</td>
                  <td>
                    <div style="display:flex;gap:6px;justify-content:flex-end;">
                      ${doc.file_url ? `<a href="${doc.file_url}" target="_blank" rel="noopener noreferrer" class="btn btn-sm">View</a>` : ''}
                      ${canEditDocument(doc) ? `<button class="btn btn-sm" onclick="openEditDocument('${doc.id}')">Manage</button>` : ''}
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!visibleDocs.length ? empty(VaultPage.docs.length ? 'No documents match your search' : 'No documents in vault yet') : ''}
      </div>

      <div class="card" style="margin-top:14px;background:var(--bg3);">
        <div style="font-size:12px;color:var(--text2);">
          To use uploads, create a Storage bucket named <code>documents</code>. If the bucket is not ready yet, you can still paste a file URL manually.
        </div>
      </div>
    </div>`;
}

function setVaultSearch(value) {
  VaultPage.search = value || '';
  renderPage('vault');
}

function openAddDocument() {
  if (!canManageDocuments()) return;
  Modal.open('Add Document', vaultForm(), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: async () => saveDocument(),
  }]);
}

function openEditDocument(documentId) {
  if (!canManageDocuments()) return;
  const documentRecord = VaultPage.docs.find((doc) => doc.id === documentId);
  if (!documentRecord) return;

  Modal.open('Manage Document', vaultForm(documentRecord), [{
    label: 'Save',
    cls: 'btn-primary',
    fn: async () => saveDocument(documentId),
  }]);
}

async function saveDocument(documentId = null) {
  hideErr('vault-err');
  const title = document.getElementById('d-title')?.value.trim() || '';
  if (!title) {
    showErr('vault-err', 'Document title is required.');
    return;
  }

  let fileUrl = document.getElementById('d-url')?.value.trim() || null;
  let fileName = document.getElementById('d-name')?.value.trim() || null;
  let fileSizeKb = null;
  const file = document.getElementById('d-file')?.files?.[0];

  if (file) {
    const upload = await uploadVaultFile(file);
    if (upload?.error) {
      showErr('vault-err', upload.error.message || 'Failed to upload file.');
      return;
    }
    fileUrl = upload.url;
    fileName = upload.name;
    fileSizeKb = upload.sizeKb;
  }

  const payload = {
    family_id: State.fid,
    title,
    category: document.getElementById('d-category')?.value || 'other',
    access_level: document.getElementById('d-access')?.value || 'members',
    file_url: fileUrl,
    file_name: fileName || null,
  };

  if (fileSizeKb) payload.file_size_kb = fileSizeKb;
  if (!documentId) payload.uploaded_by = State.uid;

  const query = documentId
    ? DB.client.from('documents').update(payload).eq('id', documentId)
    : DB.client.from('documents').insert(payload);

  const { error } = await query;
  if (error) {
    showErr('vault-err', error.message);
    return;
  }

  Modal.close();
  renderPage('vault');
}

Router.register('vault', renderVault);
