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

    State.currentPage = resolvedPage;
    if (remember) this.remember(resolvedPage);

    // Update sidebar active state
    document.querySelectorAll('.sb-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === resolvedPage);
    });

    // Close mobile sidebar
    Sidebar.close();

    // Render
    const content = document.getElementById('page-content');
    content.innerHTML = loading();

    const renderer = this._routes[resolvedPage];
    if (renderer) {
      await renderer();
    } else {
      content.innerHTML = `<div class="content"><div class="card">Page <strong>${resolvedPage}</strong> not found.</div></div>`;
    }

    if (typeof Sidebar?.refreshAnnouncementBadge === 'function') {
      Sidebar.refreshAnnouncementBadge().catch((error) => {
        console.warn('[Router] Failed to refresh announcement badge:', error);
      });
    }
  },
};

/** Global shorthand used by onclick attributes in the sidebar template. */
function nav(page) { Router.go(page); }

/** Set the topbar title and optional action buttons HTML. */
function setTopbar(title, actionsHtml = '') {
  document.getElementById('page-title').textContent       = title;
  document.getElementById('topbar-actions').innerHTML     = actionsHtml;
}

/**
 * Re-render the current page.
 * Called by modal "Save" handlers after a DB write.
 * @param {string} [page] — optional override; defaults to State.currentPage
 */
function renderPage(page) { Router.go(page || State.currentPage); }
