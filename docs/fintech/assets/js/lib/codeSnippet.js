import Prism from '../node_modules/prismjs/prism.js';
import '../node_modules/prismjs/components/prism-go.js';
import '../node_modules/prismjs/components/prism-bash.js';
import '../node_modules/prismjs/components/prism-python.js';

// Vanilla DOM port of the old CodeSnippet.tsx / LanguageTabs.tsx React
// components — same markup, same CSS classes (.snippet, .lang-tabs, ...),
// just built and wired by hand instead of by React.
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
async function copyToClipboard(button, text) {
    try {
        await navigator.clipboard.writeText(text);
        const original = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => {
            button.textContent = original;
        }, 1500);
    }
    catch {
        // clipboard permission denied — non-fatal, just skip the confirmation
    }
}
function renderLanguageTabs(container, opts) {
    const tabButtons = opts.tabs
        .map((t, i) => `<button type="button" class="lang-tab${i === 0 ? ' lang-tab-active' : ''}" data-tab-id="${t.id}">${escapeHtml(t.label)}</button>`)
        .join('');
    container.innerHTML = `
    <div class="snippet">
      <div class="snippet-header">
        <span class="snippet-dot"></span>
        <span class="snippet-path">${escapeHtml(opts.title)}</span>
        <button type="button" class="snippet-copy">Copy</button>
      </div>
      <div class="lang-tabs">${tabButtons}</div>
      <pre><code></code></pre>
    </div>
  `;
    const pre = container.querySelector('pre');
    const code = container.querySelector('code');
    const copyBtn = container.querySelector('.snippet-copy');
    const tabEls = Array.from(container.querySelectorAll('.lang-tab'));
    let current = opts.tabs[0];
    function renderCurrent() {
        pre.className = `language-${current.lang}`;
        code.className = `language-${current.lang}`;
        code.textContent = current.code;
        Prism.highlightElement(code);
    }
    tabEls.forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = opts.tabs.find((t) => t.id === btn.dataset.tabId);
            if (!tab)
                return;
            current = tab;
            tabEls.forEach((b) => b.classList.toggle('lang-tab-active', b === btn));
            renderCurrent();
        });
    });
    copyBtn.addEventListener('click', () => copyToClipboard(copyBtn, current.code));
    renderCurrent();
}

export { renderLanguageTabs };
