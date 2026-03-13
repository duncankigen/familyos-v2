/**
 * js/pages/vault.js
 * ─────────────────────────────────────────────────────
 * Document vault: store links and metadata for important
 * family documents (title deeds, certificates, contracts).
 */

async function renderVault() {
  setTopbar('Vault', `<button class="btn btn-primary btn-sm" onclick="openAddDocument()">+ Add Document</button>`);
  const { data: docs } = await DB.client
    .from('documents')
    .select('*,users(full_name)')
    .eq('family_id', State.fid)
    .order('created_at', { ascending: false });

  const docTypeIcon = {
    title_deed: '🏠', contract: '📋', certificate: '🎓',
    receipt: '🧾', photo: '📷', other: '📄',
  };

  document.getElementById('page-content').innerHTML = `
    <div class="content">
      <div class="g4 mb16">
        <div class="metric-card"><div class="metric-label">Total Documents</div>
          <div class="metric-value">${(docs || []).length}</div></div>
        <div class="metric-card"><div class="metric-label">Title Deeds</div>
          <div class="metric-value">${(docs || []).filter(d => d.document_type === 'title_deed').length}</div></div>
        <div class="metric-card"><div class="metric-label">Certificates</div>
          <div class="metric-value">${(docs || []).filter(d => d.document_type === 'certificate').length}</div></div>
        <div class="metric-card"><div class="metric-label">Contracts</div>
          <div class="metric-value">${(docs || []).filter(d => d.document_type === 'contract').length}</div></div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Document</th><th>Type</th><th>Access</th><th>Added By</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              ${(docs || []).map(d => `
                <tr>
                  <td>
                    <div style="font-weight:600;">${docTypeIcon[d.document_type] || '📄'} ${d.title}</div>
                    ${d.description ? `<div style="font-size:11px;color:var(--text3);">${d.description}</div>` : ''}
                  </td>
                  <td><span class="badge b-blue">${d.document_type?.replace('_', ' ') || 'other'}</span></td>
                  <td>${d.access_level === 'admin' ? '<span class="badge b-red">Admins only</span>' : '<span class="badge b-green">All members</span>'}</td>
                  <td style="font-size:12px;">${d.users?.full_name || '—'}</td>
                  <td style="font-size:12px;color:var(--text3);">${fmtDate(d.created_at)}</td>
                  <td>${d.file_url ? `<a href="${d.file_url}" target="_blank" class="btn btn-sm">View</a>` : ''}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${!(docs || []).length ? empty('No documents in vault yet') : ''}
      </div>

      <div class="card" style="margin-top:14px;background:var(--bg3);">
        <div style="font-size:12px;color:var(--text2);">
          <strong>ℹ️ Storage Setup:</strong> To enable file uploads, create a storage bucket named
          <code>documents</code> in your Supabase project → Storage → New Bucket. Then add the
          storage URL to documents after uploading files there.
        </div>
      </div>
    </div>`;
}

function openAddDocument() {
  Modal.open('Add Document', `
    <div class="form-group"><label class="form-label">Document Title</label>
      <input id="d-title" class="form-input" placeholder="Title Deed — Kitale Plot 234"/></div>
    <div class="form-group"><label class="form-label">Description</label>
      <input id="d-desc" class="form-input" placeholder="Original title deed for 5-acre farm"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Type</label>
        <select id="d-type" class="form-select">
          <option value="title_deed">Title Deed</option>
          <option value="contract">Contract</option>
          <option value="certificate">Certificate</option>
          <option value="receipt">Receipt</option>
          <option value="photo">Photo</option>
          <option value="other">Other</option>
        </select></div>
      <div class="form-group"><label class="form-label">Access Level</label>
        <select id="d-access" class="form-select">
          <option value="members">All Members</option>
          <option value="admin">Admins Only</option>
        </select></div>
    </div>
    <div class="form-group"><label class="form-label">File URL (optional)</label>
      <input id="d-url" class="form-input" placeholder="https://... (from Supabase Storage)"/></div>
  `, [{ label: 'Save', cls: 'btn-primary', fn: async () => {
    await DB.client.from('documents').insert({
      family_id:     State.fid,
      title:         document.getElementById('d-title').value,
      description:   document.getElementById('d-desc').value,
      document_type: document.getElementById('d-type').value,
      access_level:  document.getElementById('d-access').value,
      file_url:      document.getElementById('d-url').value || null,
      uploaded_by:   State.uid,
    });
    Modal.close(); renderPage('vault');
  }}]);
}

Router.register('vault', renderVault);
