/**
 * js/core/router.js
 * ─────────────────────────────────────────────────────
 * Client-side router.  Maps page keys to render functions
 * defined in js/pages/*.js.  All navigation goes through
 * Router.go() — never touch page-content directly.
 */

const Router = {
  /** Registry populated by each page file calling Router.register(). */
  _routes: {},
  _storageKey: 'fos_page',

  /**
   * Register a page renderer.
   * Called at the bottom of each js/pages/*.js file.
   *
   * @param {string}   key  — page identifier e.g. 'dashboard'
   * @param {Function} fn   — async render function
   */
  register(key, fn) {
    this._routes[key] = fn;
  },

  has(page) {
    return Boolean(this._routes[page]);
  },

  resolve(page) {
    return this.has(page) ? page : 'dashboard';
  },

  restore() {
    const hashPage = window.location.hash.replace(/^#\/?/, '').trim();
    const savedPage = localStorage.getItem(this._storageKey) || '';
    return this.resolve(hashPage || savedPage || 'dashboard');
  },

  remember(page) {
    const resolvedPage = this.resolve(page);
    localStorage.setItem(this._storageKey, resolvedPage);

    const nextHash = `#${resolvedPage}`;
    if (window.location.hash === nextHash) return;

    if (window.history?.replaceState) {
      const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
      window.history.replaceState(null, '', nextUrl);
      return;
    }

    window.location.hash = resolvedPage;
  },

  clearRememberedPage() {
    localStorage.removeItem(this._storageKey);

    if (!window.location.hash) return;

    if (window.history?.replaceState) {
      const nextUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, '', nextUrl);
      return;
    }

    window.location.hash = '';
  },

  /**
   * Navigate to a page.
   * Updates the active sidebar item, sets page title, runs renderer.
   *
   * @param {string} page
   */
  async go(page, options = {}) {
    const { remember = true } = options;
    const resolvedPage = this.resolve(page);
    const gate = typeof resolveBillingPageAccess === 'function'
      ? resolveBillingPageAccess(resolvedPage)
      : { page: resolvedPage, readOnly: false, showPrompt: false };
    const finalPage = this.resolve(gate.page);

    State.currentPage = finalPage;
    if (remember) this.remember(finalPage);

    // Update sidebar active state
    document.querySelectorAll('.sb-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === finalPage);
    });

    // Close mobile sidebar
    Sidebar.close();

    // Render
    const content = document.getElementById('page-content');
    if (typeof applyBillingReadOnlyState === 'function') {
      applyBillingReadOnlyState(finalPage, { beforeRender: true, readOnly: gate.readOnly });
    }
    content.innerHTML = loading();

    const renderer = this._routes[finalPage];
    if (renderer) {
      await renderer();
    } else {
      content.innerHTML = `<div class="content"><div class="card">Page <strong>${finalPage}</strong> not found.</div></div>`;
    }

    if (typeof applyBillingReadOnlyState === 'function') {
      applyBillingReadOnlyState(finalPage, { readOnly: gate.readOnly });
    }

    if (gate.showPrompt && typeof openBillingStatusModal === 'function') {
      window.setTimeout(() => openBillingStatusModal(), 0);
    }

    if (typeof Sidebar?.refreshSectionIndicators === 'function') {
      Sidebar.refreshSectionIndicators().catch((error) => {
        console.warn('[Router] Failed to refresh section indicators:', error);
      });
    }

    if (typeof Notifications?.refreshBadge === 'function') {
      Notifications.refreshBadge().catch((error) => {
        console.warn('[Router] Failed to refresh notifications badge:', error);
      });
    }
  },
};

/** Global shorthand used by onclick attributes in the sidebar template. */
function nav(page) { Router.go(page); }

/** Set the topbar title and optional action buttons HTML. */
function setTopbar(title, actionsHtml = '') {
  const notificationHtml = typeof Notifications?.buttonHtml === 'function'
    ? Notifications.buttonHtml()
    : '';
  document.getElementById('page-title').textContent       = title;
  const actionClass = typeof isWorkspaceRestricted === 'function' && isWorkspaceRestricted()
    ? 'billing-actions-disabled'
    : '';
  document.getElementById('topbar-actions').innerHTML     = `<div class="${actionClass}">${actionsHtml || ''}</div>${notificationHtml}`;
}

/**
 * Re-render the current page.
 * Called by modal "Save" handlers after a DB write.
 * @param {string} [page] — optional override; defaults to State.currentPage
 */
function renderPage(page) { Router.go(page || State.currentPage); }
