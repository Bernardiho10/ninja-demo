import Prism from '../node_modules/prismjs/prism.js';
import '../node_modules/prismjs/components/prism-go.js';
import '../node_modules/prismjs/components/prism-bash.js';
import '../node_modules/prismjs/components/prism-python.js';

// =============================================================================
// ninja-bet V2: Code-First Action Confirmation Slide-Out
// =============================================================================
// When a developer clicks an action button, this modal slides out to show the
// exact Ninja API request payload FIRST. The developer clicks "Noted, Proceed"
// to execute the live call.
// =============================================================================
let activeContainer = null;
function showCodeFirstSlideOut(options) {
    // Remove any open slide-out
    closeCodeFirstSlideOut();
    const overlay = document.createElement('div');
    overlay.className = 'code-drawer-overlay';
    overlay.id = 'code-drawer-overlay';
    let activeTab = 'curl';
    const getActiveCode = () => {
        switch (activeTab) {
            case 'curl':
                return { code: options.curl, lang: 'bash' };
            case 'ts':
                return { code: options.ts, lang: 'javascript' };
            case 'python':
                return { code: options.python, lang: 'python' };
            case 'go':
                return { code: options.go, lang: 'go' };
        }
    };
    const renderContent = () => {
        const { code, lang } = getActiveCode();
        const highlighted = Prism.highlight(code, Prism.languages[lang] || Prism.languages.javascript, lang);
        overlay.innerHTML = `
      <div class="code-drawer-card" role="dialog" aria-modal="true">
        <div class="code-drawer-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="method-tag tag-${options.method.toLowerCase()}">${options.method}</span>
            <code class="endpoint-code">${escapeHtml(options.endpoint)}</code>
          </div>
          <button type="button" class="btn-close-drawer" id="btn-close-drawer">✕</button>
        </div>

        <div class="code-drawer-body">
          <h3 class="drawer-title">${escapeHtml(options.title)}</h3>
          <p class="drawer-desc">${escapeHtml(options.description)}</p>

          <div class="code-drawer-tabs">
            <button type="button" class="tab-btn ${activeTab === 'curl' ? 'active' : ''}" data-tab="curl">cURL</button>
            <button type="button" class="tab-btn ${activeTab === 'ts' ? 'active' : ''}" data-tab="ts">TypeScript / JS</button>
            <button type="button" class="tab-btn ${activeTab === 'python' ? 'active' : ''}" data-tab="python">Python</button>
            <button type="button" class="tab-btn ${activeTab === 'go' ? 'active' : ''}" data-tab="go">Go</button>
          </div>

          <div class="code-snippet-pre-wrap">
            <pre class="language-${lang}"><code class="language-${lang}">${highlighted}</code></pre>
          </div>
        </div>

        <div class="code-drawer-footer">
          <button type="button" class="btn-drawer-cancel" id="btn-drawer-cancel">Cancel</button>
          <button type="button" class="btn-drawer-proceed" id="btn-drawer-proceed">
            ${escapeHtml(options.confirmLabel || 'Noted, Proceed with Request →')}
          </button>
        </div>
      </div>
    `;
        // Wire events
        overlay.querySelector('#btn-close-drawer')?.addEventListener('click', closeCodeFirstSlideOut);
        overlay.querySelector('#btn-drawer-cancel')?.addEventListener('click', closeCodeFirstSlideOut);
        overlay.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                activeTab = e.currentTarget.dataset.tab;
                renderContent();
            });
        });
        const proceedBtn = overlay.querySelector('#btn-drawer-proceed');
        proceedBtn?.addEventListener('click', async () => {
            if (proceedBtn) {
                proceedBtn.disabled = true;
                proceedBtn.textContent = 'Executing live Ninja Sandbox request…';
            }
            try {
                await options.onProceed();
                closeCodeFirstSlideOut();
            }
            catch (err) {
                if (proceedBtn) {
                    proceedBtn.disabled = false;
                    proceedBtn.textContent = options.confirmLabel || 'Noted, Proceed with Request →';
                }
            }
        });
    };
    renderContent();
    document.body.appendChild(overlay);
    activeContainer = overlay;
    // Close on escape
    const onKey = (e) => {
        if (e.key === 'Escape') {
            closeCodeFirstSlideOut();
            document.removeEventListener('keydown', onKey);
        }
    };
    document.addEventListener('keydown', onKey);
}
function closeCodeFirstSlideOut() {
    if (activeContainer) {
        activeContainer.remove();
        activeContainer = null;
    }
}
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export { closeCodeFirstSlideOut, showCodeFirstSlideOut };
