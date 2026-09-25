// A shared error modal — inline `.error` text is easy to miss on a long
// page (Play especially); anything that blocks the user from finishing
// what they were doing gets a modal too, not instead of the inline text.
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function showErrorModal(message, title = 'Something went wrong') {
    document.querySelector('.error-modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'error-modal-overlay';
    overlay.innerHTML = `
    <div class="error-modal" role="alertdialog" aria-modal="true" aria-labelledby="error-modal-title">
      <h3 id="error-modal-title">${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="error-modal-close">OK</button>
    </div>
  `;
    document.body.appendChild(overlay);
    function close() {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
        if (e.key === 'Escape')
            close();
    }
    overlay.querySelector('.error-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay)
            close();
    });
    document.addEventListener('keydown', onKey);
    overlay.querySelector('.error-modal-close').focus();
}

export { showErrorModal };
