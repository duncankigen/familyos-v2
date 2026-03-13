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

  /**
   * Navigate to a page.
   * Updates the active sidebar item, sets page title, runs renderer.
   *
   * @param {string} page
   */
  async go(page) {
    State.currentPage = page;

    // Update sidebar active state
    document.querySelectorAll('.sb-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    // Close mobile sidebar
    Sidebar.close();

    // Render
    const content = document.getElementById('page-content');
    content.innerHTML = loading();

    const renderer = this._routes[page];
    if (renderer) {
      await renderer();
    } else {
      content.innerHTML = `<div class="content"><div class="card">Page <strong>${page}</strong> not found.</div></div>`;
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
