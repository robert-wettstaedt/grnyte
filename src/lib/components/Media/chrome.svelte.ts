import type { Attachment } from 'svelte/attachments'

const HIDE_AFTER_MS = 3000
const DOUBLE_TAP_WINDOW_MS = 250

export type ChromeMode = 'manual' | 'pinned' | 'timed'
export type ChromeSheet = 'sheet' | 'stageSheet'

export type MediaChrome = ReturnType<typeof createMediaChrome>

/** Whether the media viewer's controls show. The page owns it, because its toolbar and the stage's
 *  footer hide together: `timed` is a video, `manual` a photo, `pinned` a state with nothing to hide for. */
export function createMediaChrome() {
  let visible = $state(true)
  let mode: ChromeMode = 'manual'
  let playing = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pendingHide: ReturnType<typeof setTimeout> | undefined
  let ignoreTapsUntil = 0
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- reactive reads would rerun the stage's reset effect on every hold.
  const holds = new Set<ChromeSheet | symbol>()
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- only read when the timer fires.
  const surfaces = new Set<HTMLElement>()
  let keyboardFocused: Element | null = null

  const cancelPendingHide = () => {
    clearTimeout(pendingHide)
    pendingHide = undefined
  }

  // Takes focus along, or Space would activate a button the reader cannot see.
  const hide = () => {
    visible = false
    const active = document.activeElement
    if (active instanceof HTMLElement && [...surfaces].some((surface) => surface.contains(active))) active.blur()
  }

  const arm = () => {
    clearTimeout(timer)
    if (mode === 'timed' && playing && holds.size === 0) {
      timer = setTimeout(() => {
        // Compared when the timer fires: a focused control can unmount without any focusout.
        if (keyboardFocused != null && document.activeElement === keyboardFocused) arm()
        else hide()
      }, HIDE_AFTER_MS)
    }
  }

  const reveal = () => {
    cancelPendingHide()
    visible = true
    arm()
  }

  const setHold = (hold: ChromeSheet | symbol, on: boolean) => {
    if (on) {
      holds.add(hold)
      reveal()
    } else if (holds.delete(hold)) {
      arm()
    }
  }

  return {
    destroy() {
      clearTimeout(timer)
      cancelPendingHide()
    },
    reset(next: ChromeMode) {
      mode = next
      reveal()
    },
    reveal,
    setHold: (sheet: ChromeSheet, on: boolean) => setHold(sheet, on),
    setPlaying(next: boolean) {
      playing = next
      arm()
    },
    get sheetOpen() {
      return holds.has('sheet') || holds.has('stageSheet')
    },
    surface: ((node) => {
      // One per surface: paging unmounts the footer while the pointer rests on an arrow.
      const hover = Symbol('hover')
      const press = Symbol('press')
      const onEnter = (event: PointerEvent) => {
        if (event.pointerType === 'mouse') setHold(hover, true)
      }
      const onLeave = () => setHold(hover, false)
      const onPress = () => setHold(press, true)
      const onRelease = () => setHold(press, false)
      // Judged as focus arrives: a touch press leaves its button focused, and a later key press flips
      // that button to :focus-visible, and neither may stop auto-hide for good.
      const onFocusIn = (event: FocusEvent) => {
        const arrivedByKeyboard = event.target instanceof Element && event.target.matches(':focus-visible')
        keyboardFocused = arrivedByKeyboard ? (event.target as Element) : null
        if (arrivedByKeyboard) reveal()
      }

      surfaces.add(node)
      node.addEventListener('pointerenter', onEnter)
      node.addEventListener('pointerleave', onLeave)
      node.addEventListener('pointerdown', onPress)
      node.addEventListener('focusin', onFocusIn)
      node.addEventListener('focusout', arm)
      window.addEventListener('pointerup', onRelease)
      window.addEventListener('pointercancel', onRelease)
      return () => {
        node.removeEventListener('pointerenter', onEnter)
        node.removeEventListener('pointerleave', onLeave)
        node.removeEventListener('pointerdown', onPress)
        node.removeEventListener('focusin', onFocusIn)
        node.removeEventListener('focusout', arm)
        window.removeEventListener('pointerup', onRelease)
        window.removeEventListener('pointercancel', onRelease)
        onLeave()
        onRelease()
        surfaces.delete(node)
        if (node.contains(keyboardFocused)) keyboardFocused = null
      }
    }) satisfies Attachment<HTMLElement>,
    tap() {
      if (mode === 'pinned' || holds.size > 0 || Date.now() < ignoreTapsUntil) return
      if (!visible || pendingHide != null) {
        reveal()
        return
      }
      clearTimeout(timer)
      pendingHide = setTimeout(() => {
        pendingHide = undefined
        hide()
      }, DOUBLE_TAP_WINDOW_MS)
    },
    get visible() {
      return visible
    },
    // d3 takes the second tap of a double-tap, so its click may never come, or may come after the zoom.
    zoomed() {
      if (pendingHide == null) return
      reveal()
      ignoreTapsUntil = Date.now() + DOUBLE_TAP_WINDOW_MS
    },
  }
}

/** Fades a control group. It stays mounted, in the tab order and in the accessibility tree, and only
 *  its controls take presses while visible, so the rest of the group passes a tap to the media. */
export const chromeClass = (visible: boolean) => [
  'pointer-events-none transition-opacity duration-150 motion-reduce:transition-none',
  visible ? '[&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto' : 'opacity-0',
]
