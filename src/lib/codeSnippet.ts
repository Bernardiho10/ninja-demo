// Vanilla DOM port of the old CodeSnippet.tsx / LanguageTabs.tsx React
// components — same markup, same CSS classes (.snippet, .lang-tabs, ...),
// just built and wired by hand instead of by React.
import Prism from 'prismjs'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-python'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function copyToClipboard(button: HTMLButtonElement, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    const original = button.textContent
    button.textContent = 'Copied'
    setTimeout(() => {
      button.textContent = original
    }, 1500)
  } catch {
    // clipboard permission denied — non-fatal, just skip the confirmation
  }
}

export interface LanguageTab {
  id: string
  label: string
  lang: string
  code: string
}

export function renderLanguageTabs(container: HTMLElement, opts: { title: string; tabs: LanguageTab[] }) {
  const tabButtons = opts.tabs
    .map((t, i) => `<button type="button" class="lang-tab${i === 0 ? ' lang-tab-active' : ''}" data-tab-id="${t.id}">${escapeHtml(t.label)}</button>`)
    .join('')

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
  `

  const pre = container.querySelector('pre') as HTMLElement
  const code = container.querySelector('code') as HTMLElement
  const copyBtn = container.querySelector('.snippet-copy') as HTMLButtonElement
  const tabEls = Array.from(container.querySelectorAll('.lang-tab')) as HTMLButtonElement[]

  let current = opts.tabs[0]

  function renderCurrent() {
    pre.className = `language-${current.lang}`
    code.className = `language-${current.lang}`
    code.textContent = current.code
    Prism.highlightElement(code)
  }

  tabEls.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = opts.tabs.find((t) => t.id === btn.dataset.tabId)
      if (!tab) return
      current = tab
      tabEls.forEach((b) => b.classList.toggle('lang-tab-active', b === btn))
      renderCurrent()
    })
  })

  copyBtn.addEventListener('click', () => copyToClipboard(copyBtn, current.code))
  renderCurrent()
}

export function renderCodeDrawer(
  container: HTMLElement,
  opts: {
    title: string
    subtitle?: string
    buttonLabel?: string
    tabs: LanguageTab[]
    defaultOpen?: boolean
  }
) {
  const btnText = opts.buttonLabel || 'View Ninja API Integration'
  const isDefaultOpen = !!opts.defaultOpen

  container.innerHTML = `
    <div class="code-drawer ${isDefaultOpen ? 'code-drawer-open' : ''}">
      <button type="button" class="code-drawer-toggle">
        <span class="toggle-icon">&lt;/&gt;</span>
        <span class="toggle-title">${escapeHtml(btnText)}</span>
        <span class="toggle-meta">${escapeHtml(opts.title)}</span>
        <span class="toggle-chevron">${isDefaultOpen ? '▲' : '▼'}</span>
      </button>
      <div class="code-drawer-content" ${isDefaultOpen ? '' : 'hidden'}>
        ${opts.subtitle ? `<div class="code-drawer-subtitle">${escapeHtml(opts.subtitle)}</div>` : ''}
        <div class="code-tabs-mount"></div>
      </div>
    </div>
  `

  const toggleBtn = container.querySelector('.code-drawer-toggle') as HTMLButtonElement
  const contentEl = container.querySelector('.code-drawer-content') as HTMLElement
  const chevronEl = container.querySelector('.toggle-chevron') as HTMLElement
  const drawerEl = container.querySelector('.code-drawer') as HTMLElement
  const mountEl = container.querySelector('.code-tabs-mount') as HTMLElement

  renderLanguageTabs(mountEl, { title: opts.title, tabs: opts.tabs })

  toggleBtn.addEventListener('click', () => {
    const isOpen = !contentEl.hidden
    contentEl.hidden = isOpen
    chevronEl.textContent = isOpen ? '▼' : '▲'
    drawerEl.classList.toggle('code-drawer-open', !isOpen)
  })
}
