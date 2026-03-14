/**
 * js/core/helpers.js
 * ─────────────────────────────────────────────────────
 * Pure utility functions shared across every page and
 * component. No Supabase calls, no DOM side-effects.
 */

/** Format a number as KES with thousands separators. */
function fmt(n) {
  return Number(n || 0).toLocaleString('en-KE');
}

/** Format an ISO date string to "12 Mar 2025". */
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Return a relative time string: "just now", "3h ago", etc. */
function ago(d) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return fmtDate(d);
}

/** Show a DOM element's error paragraph. */
function showErr(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.style.display = 'block'; el.textContent = msg; }
}

/** Hide a DOM element's error paragraph. */
function hideErr(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

/**
 * Return a coloured badge HTML string.
 * @param {string} s  — status value e.g. 'active', 'overdue'
 */
function statusBadge(s) {
  const map = {
    active: 'b-green', planning: 'b-blue', paused: 'b-amber',
    completed: 'b-gray', achieved: 'b-green', scheduled: 'b-blue', cancelled: 'b-red',
    pending: 'b-amber', in_progress: 'b-blue', overdue: 'b-red',
    paid: 'b-green', partial: 'b-amber',
    open: 'b-green', closed: 'b-gray',
  };
  return `<span class="badge ${map[s?.toLowerCase()] || 'b-gray'}">${s || '—'}</span>`;
}

/** Return a role badge (colour-coded by role name). */
function roleBadge(r) {
  const map = {
    admin: 'b-red', treasurer: 'b-purple',
    project_manager: 'b-blue', member: 'b-gray', youth: 'b-green',
  };
  return `<span class="badge ${map[r] || 'b-gray'}">${r}</span>`;
}

/** Pick a deterministic avatar colour class from a name string. */
function avatarColor(name) {
  const palette = ['av-blue','av-green','av-amber','av-purple','av-coral','av-teal'];
  return palette[(name || 'A').charCodeAt(0) % palette.length];
}

/** Return avatar HTML for a given name and size class. */
function avatarHtml(name, size = 'av-sm') {
  const initials = (name || '?')
    .split(' ')
    .map(x => x[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
  return `<div class="avatar ${size} ${avatarColor(name)}">${initials}</div>`;
}

/** Standard loading spinner markup. */
function loading() {
  return `<div class="loading-screen"><div class="spinner"></div>Loading...</div>`;
}

/** Standard empty-state markup. */
function empty(msg) {
  return `
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="1.5"/>
        <path d="M14 20h12M20 14v12" stroke="currentColor" stroke-width="1.5"/>
      </svg>
      ${msg}
    </div>`;
}

/** Escape user-controlled text before injecting it into HTML. */
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build a safe filename-friendly suffix. */
function safeFileName(value) {
  return String(value || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'file';
}

/** Return a YYYY-MM-DD date stamp for exports. */
function exportDateStamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Download an array of objects as CSV. */
function downloadCsv(filename, rows) {
  const items = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!items.length) return false;

  const headers = [...new Set(items.flatMap((row) => Object.keys(row || {})))];
  if (!headers.length) return false;

  const escapeCsv = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const csv = [
    headers.join(','),
    ...items.map((row) => headers.map((header) => escapeCsv(row?.[header])).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `export-${exportDateStamp()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

/** Open a print-friendly window for the provided HTML. */
function openPrintDocument(title, bodyHtml) {
  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) return false;

  const stylesheetLinks = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((link) => `<link rel="stylesheet" href="${link.href}">`)
    .join('');

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title || 'FamilyOS Print View')}</title>
    ${stylesheetLinks}
    <style>
      body { padding: 24px; background: #fff; }
      .print-shell { max-width: 1100px; margin: 0 auto; }
      .print-head { margin-bottom: 20px; }
      .print-title { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
      .print-sub { font-size: 12px; color: #666; }
      @media print {
        body { padding: 0; }
      }
    </style>
  </head>
  <body>
    <div class="print-shell">
      <div class="print-head">
        <div class="print-title">${escapeHtml(title || 'FamilyOS Report')}</div>
        <div class="print-sub">Generated ${fmtDate(new Date().toISOString())}</div>
      </div>
      ${bodyHtml || ''}
    </div>
  </body>
  </html>`);
  printWindow.document.close();

  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);

  return true;
}

/** Upload a single optional record attachment and return a public URL plus label. */
async function uploadFinanceAttachment(file, folder) {
  if (!file) return { url: null, name: null };

  const bucket = 'receipts';
  const ext = (file.name.split('.').pop() || 'file').toLowerCase();
  const familyId = State.fid || 'family';
  const userId = State.uid || 'user';
  const path = `${folder}/${familyId}/${Date.now()}-${userId}-${safeFileName(file.name.replace(/\.[^.]+$/, ''))}.${ext}`;

  const { error: uploadError } = await DB.client.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) return { error: uploadError };

  const { data } = DB.client.storage.from(bucket).getPublicUrl(path);
  return {
    url: data?.publicUrl || null,
    name: file.name || null,
  };
}
