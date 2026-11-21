/*
 * iOS home-screen apps: after the software keyboard closes, the viewport can stay
 * shrunk until the app is force-quit (bottom bar too high, empty band at the bottom).
 * Toggling display on the full-height app shell makes WebKit re-measure the viewport.
 */
let maxHeight = 0

function heal() {
  const root = document.getElementById('app-root')
  if (!root) return
  window.scrollTo(0, 0)
  if (window.innerHeight >= maxHeight - 4) return
  const scroller = document.getElementById('app-scroll')
  const top = scroller?.scrollTop ?? 0
  root.style.display = 'none'
  void root.offsetHeight // force a synchronous reflow
  root.style.display = ''
  if (scroller) scroller.scrollTop = top
}

export function initViewportHeal() {
  const track = () => {
    maxHeight = Math.max(maxHeight, window.innerHeight)
  }
  track()
  window.addEventListener('resize', track)
  const isField = (t: EventTarget | null) => t instanceof HTMLElement && t.matches('input, textarea, select, [contenteditable]')
  document.addEventListener('focusout', (e) => {
    if (!isField(e.target)) return
    // give the keyboard time to go away; skip if focus just moved to another field
    setTimeout(() => {
      if (!isField(document.activeElement)) heal()
    }, 150)
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(heal, 150)
  })
}
