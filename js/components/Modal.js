/**
 * js/components/Modal.js
 * ─────────────────────────────────────────────────────
 * Reusable modal dialog.  Every page opens dialogs via
 * Modal.open() rather than building their own overlays.
 */

const Modal = {
  /**
   * Open the global modal.
   *
   * @param {string}   title    — heading text
   * @param {string}   bodyHtml — inner HTML for the modal body
   * @param {Array}    buttons  — [{ label, cls, fn }, ...]
   *                             additional action buttons
   *                             (Cancel is always added automatically)
   */
  open(title, bodyHtml, buttons = []) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML    = bodyHtml;
    const modalCard = document.querySelector('#modal .modal');
    if (modalCard) {
      modalCard.style.maxWidth = '';
    }

    const footer = document.getElementById('modal-footer');
    footer.innerHTML = `<button class="btn" onclick="Modal.close()">Cancel</button>`;

    buttons.forEach(b => {
      const btn     = document.createElement('button');
      btn.className = `btn ${b.cls || ''}`;
      btn.textContent = b.label;
      btn.onclick   = b.fn;
      footer.appendChild(btn);
    });

    document.getElementById('modal').classList.add('open');
  },

  /** Close the global modal. */
  close() {
    const modalCard = document.querySelector('#modal .modal');
    if (modalCard) {
      modalCard.style.maxWidth = '';
    }
    document.getElementById('modal').classList.remove('open');
  },
};
