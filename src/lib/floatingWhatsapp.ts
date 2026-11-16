// Draggable Floating WhatsApp Widget with LocalStorage State Persistence

const STORAGE_KEY = 'ninja_whatsapp_pos_v2'

export function initFloatingWhatsapp() {
  const widget = document.getElementById('ninja-floating-whatsapp')
  const link = document.getElementById('ninja-whatsapp-link')
  if (!widget) return

  // Restore position from localStorage or default to bottom-right
  const restorePos = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const { left, top } = JSON.parse(saved)
        const widgetWidth = widget.offsetWidth || 180
        const widgetHeight = widget.offsetHeight || 44
        const maxLeft = Math.max(0, window.innerWidth - widgetWidth - 16)
        const maxTop = Math.max(0, window.innerHeight - widgetHeight - 16)
        const clampedLeft = Math.min(Math.max(16, Number(left) || 16), maxLeft)
        const clampedTop = Math.min(Math.max(16, Number(top) || 16), maxTop)

        widget.style.left = `${clampedLeft}px`
        widget.style.top = `${clampedTop}px`
        widget.style.right = 'auto'
        widget.style.bottom = 'auto'
      } else {
        // Default position: bottom-right
        widget.style.right = '24px'
        widget.style.bottom = '24px'
        widget.style.left = 'auto'
        widget.style.top = 'auto'
      }
    } catch {}
  }

  // Restore initially (and after short tick for rendering)
  restorePos()
  setTimeout(restorePos, 50)

  // Auto-clamp when the browser window is resized
  window.addEventListener('resize', () => {
    const rect = widget.getBoundingClientRect()
    const maxLeft = Math.max(0, window.innerWidth - widget.offsetWidth - 16)
    const maxTop = Math.max(0, window.innerHeight - widget.offsetHeight - 16)

    if (rect.left > maxLeft || rect.top > maxTop) {
      const clampedLeft = Math.min(Math.max(16, rect.left), maxLeft)
      const clampedTop = Math.min(Math.max(16, rect.top), maxTop)
      widget.style.left = `${clampedLeft}px`
      widget.style.top = `${clampedTop}px`
      widget.style.right = 'auto'
      widget.style.bottom = 'auto'
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: clampedLeft, top: clampedTop }))
      } catch {}
    }
  })

  // Drag interaction
  let isDragging = false
  let hasMoved = false
  let startX = 0
  let startY = 0
  let initialLeft = 0
  let initialTop = 0

  const onPointerDown = (clientX: number, clientY: number) => {
    isDragging = true
    hasMoved = false
    startX = clientX
    startY = clientY

    const rect = widget.getBoundingClientRect()
    initialLeft = rect.left
    initialTop = rect.top

    widget.style.left = `${initialLeft}px`
    widget.style.top = `${initialTop}px`
    widget.style.right = 'auto'
    widget.style.bottom = 'auto'
    widget.classList.add('is-dragging')
  }

  const onPointerMove = (clientX: number, clientY: number) => {
    if (!isDragging) return
    const dx = clientX - startX
    const dy = clientY - startY

    if (Math.hypot(dx, dy) > 5) {
      hasMoved = true
    }

    const maxLeft = Math.max(0, window.innerWidth - widget.offsetWidth - 12)
    const maxTop = Math.max(0, window.innerHeight - widget.offsetHeight - 12)
    const newLeft = Math.min(Math.max(12, initialLeft + dx), maxLeft)
    const newTop = Math.min(Math.max(12, initialTop + dy), maxTop)

    widget.style.left = `${newLeft}px`
    widget.style.top = `${newTop}px`
  }

  const onPointerUp = () => {
    if (!isDragging) return
    isDragging = false
    widget.classList.remove('is-dragging')

    if (hasMoved) {
      const rect = widget.getBoundingClientRect()
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }))
      } catch {}
    }
  }

  // Mouse drag support
  widget.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    onPointerDown(e.clientX, e.clientY)

    const onMouseMove = (ev: MouseEvent) => {
      onPointerMove(ev.clientX, ev.clientY)
    }

    const onMouseUp = () => {
      onPointerUp()
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  // Touch drag support (mobile/tablets)
  widget.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 0) {
        const t = e.touches[0]
        onPointerDown(t.clientX, t.clientY)
      }
    },
    { passive: true }
  )

  widget.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 0) {
        const t = e.touches[0]
        onPointerMove(t.clientX, t.clientY)
      }
    },
    { passive: true }
  )

  widget.addEventListener('touchend', () => {
    onPointerUp()
  })

  // Block link opening if user dragged the widget
  link?.addEventListener('click', (e) => {
    if (hasMoved) {
      e.preventDefault()
      e.stopPropagation()
      hasMoved = false
    }
  })
}
