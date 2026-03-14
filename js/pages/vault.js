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
  return ['admin', 'treasurer'].includes(State.currentProfile?.role) || document?.uploaded_by === State.uid;
}

function describeVaultStorageError(error) {
  const message = String(error?.message || error || '').trim();
  const lower = message.toLowerCase();
  if (!message) return 'Vault upload failed. Check the documents bucket and its storage policies.';
  if (lower.includes('row-level security')) {
    return 'Vault upload was blocked by Storage policy. Run the Vault storage SQL upgrade, then try again.';
  }
  if (lower.includes('bucket') || lower.includes('not found')) {
    return 'The documents bucket is not ready yet. Run the Vault storage SQL upgrade in Supabase, then try again.';
  }
  return `Vault upload failed: ${message}`;
}

function describeVaultSaveError(error) {
  const message = String(error?.message || error || '').trim();
  const lower = message.toLowerCase();
  if (!message) return 'Unable to save this document right now.';
  if (lower.includes('row-level security')) {
    return 'Vault save was blocked by database policy. Confirm you are signed in as an admin or treasurer and apply the Vault SQL upgrade.';
  }
  return message;
}

function documentIcon(category) {
  const iconMap = {
    land_title: 'TITLE',
    contract: 'DOC',
    certificate: 'CERT',
    medical: 'MED',
    financial: 'FIN',
    family_media: 'MEDIA',
    other: 'FILE',
  };
  return iconMap[category] || 'FILE';
}

function documentCategoryLabel(category) {
  const labels = {
    land_title: 'Land Titles',
    contract: 'Contracts',
    certificate: 'Certificates',
    medical: 'Medical Records',
    financial: 'Financial Records',
    family_media: 'Family Media',
    other: 'Other Documents',
  };
  return labels[category] || 'Other Documents';
}

function documentLinkMeta(url) {
  const value = String(url || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const isSupabaseStorage = hostname.includes('supabase.co') && parsed.pathname.includes('/storage/v1/object/');
    return {
      url: value,
      hostLabel: isSupabaseStorage ? 'Stored in FamilyOS Vault' : hostname,
      isExternal: !isSupabaseStorage,
    };
  } catch (_error) {
    return { url: value, hostLabel: value, isExternal: true };
  }
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
            ['family_media', 'Family Media / Drive Links'],
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
      <input id="d-file" class="form-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.jfif,.doc,.docx,.xls,.xlsx"/></div>
    <div class="form-group"><label class="form-label">File URL (optional)</label>
      <input id="d-url" class="form-input" placeholder="https://... or shared Google Drive / Photos link" value="${escapeHtml(document?.file_url || '')}"/></div>
    <div class="form-group"><label class="form-label">File Name (optional)</label>
      <input id="d-name" class="form-input" placeholder="title-deed.pdf" value="${escapeHtml(document?.file_name || '')}"/></div>
    <div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:8px;">
      Use <strong>Family Media</strong> for shared photo albums, memorial archives, and Drive folders the whole family should be able to open.
    </div>
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
  const groupedDocs = {};
  visibleDocs.forEach((doc) => {
    const category = doc.category || 'other';
    if (!groupedDocs[category]) groupedDocs[category] = [];
    groupedDocs[category].push(doc);
  });
  const orderedCategories = ['land_title', 'certificate', 'contract', 'financial', 'medical', 'family_media', 'other']
    .filter((category) => groupedDocs[category]?.length);
  const sharedWithAllCount = VaultPage.docs.filter((doc) => doc.access_level === 'all').length;

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Documents</div>
          <div class="metric-value">${VaultPage.docs.length}</div></div>
        <div class="metric-card"><div class="metric-label">Shared With All</div>
          <div class="metric-value">${sharedWithAllCount}</div></div>
        <div class="metric-card"><div class="metric-label">Family Media</div>
          <div class="metric-value">${VaultPage.docs.filter((doc) => doc.category === 'family_media').length}</div></div>
        <div class="metric-card"><div class="metric-label">Sections</div>
          <div class="metric-value">${new Set(VaultPage.docs.map((doc) => doc.category || 'other')).size}</div></div>
      </div>

      <div class="card">
        <div class="form-group mb12">
          <label class="form-label">Search Vault</label>
          <input class="form-input" placeholder="Search by title, category, file name, or member" value="${escapeHtml(VaultPage.search)}" oninput="setVaultSearch(this.value)"/>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px;">
          ${orderedCategories.map((category) => `
            <div class="card" style="background:var(--bg3);">
              <div class="flex-between mb8" style="gap:8px;flex-wrap:wrap;">
                <div>
                  <div class="card-title" style="margin-bottom:2px;">${documentCategoryLabel(category)}</div>
                  <div style="font-size:12px;color:var(--text3);">${groupedDocs[category].length} item(s)</div>
                </div>
                <span class="badge b-blue">${escapeHtml(category.replace('_', ' '))}</span>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr><th>Document</th><th>Access</th><th>Added By</th><th>Date</th><th></th></tr>
                  </thead>
                  <tbody>
                    ${groupedDocs[category].map((doc) => `
                      <tr>
                        <td>
                          ${doc.file_url ? `
                            <a
                              href="${doc.file_url}"
                              target="_blank"
                              rel="noopener noreferrer"
                              style="font-weight:700;color:var(--accent);text-decoration:none;"
                            >
                              ${documentIcon(doc.category)} ${escapeHtml(doc.title)}
                            </a>
                          ` : `<div style="font-weight:600;">${documentIcon(doc.category)} ${escapeHtml(doc.title)}</div>`}
                          ${doc.file_name
                            ? (doc.file_url
                              ? `<div style="font-size:11px;color:var(--text3);"><a href="${doc.file_url}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">${escapeHtml(doc.file_name)}</a>${doc.file_size_kb ? ` · ${fmt(doc.file_size_kb)} KB` : ''}</div>`
                              : `<div style="font-size:11px;color:var(--text3);">${escapeHtml(doc.file_name)}${doc.file_size_kb ? ` · ${fmt(doc.file_size_kb)} KB` : ''}</div>`)
                            : ''}
                          ${doc.file_url ? (() => {
                            const meta = documentLinkMeta(doc.file_url);
                            return `<div style="font-size:11px;color:var(--text3);">${escapeHtml(meta?.hostLabel || doc.file_url)}</div>`;
                          })() : ''}
                        </td>
                        <td>${documentAccessBadge(doc.access_level)}</td>
                        <td style="font-size:12px;">${escapeHtml(doc.users?.full_name || '—')}</td>
                        <td style="font-size:12px;color:var(--text3);">${fmtDate(doc.created_at)}</td>
                        <td>
                          <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;">
                            ${canEditDocument(doc) ? `<button class="btn btn-sm" onclick="openEditDocument('${doc.id}')">Manage</button>` : ''}
                          </div>
                        </td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>
            </div>`).join('')}
        </div>
        ${!visibleDocs.length ? empty(VaultPage.docs.length ? 'No documents match your search' : 'No documents in vault yet') : ''}
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
      showErr('vault-err', describeVaultStorageError(upload.error));
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
    showErr('vault-err', describeVaultSaveError(error));
    return;
  }

  Modal.close();
  renderPage('vault');
}

Router.register('vault', renderVault);
