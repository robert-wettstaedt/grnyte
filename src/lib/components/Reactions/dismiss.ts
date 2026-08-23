import type { Attachment } from 'svelte/attachments'

/**
 * Close a floating row when the next press lands anywhere else. The quick emoji row has no scrim of
 * its own, so nothing else dismisses it; one implementation for both rows, since "did this press
 * happen inside me" is the question `Modal.mobile` got wrong once already.
 *
 * Listeners on the document rather than markup handlers, because a `<div>` that answers keys is a
 * control Svelte would (rightly) want a role on, and this one is only a container. `pointerdown`
 * rather than `click`, so the row is gone before the press it was dismissed by turns into anything.
 */
export function dismissOutside(
  close: () => void,
  opts?: {
    /** Answer Escape too. Off where a layer above (a sheet) owns that key. */
    escape?: boolean
    /** Nodes that do not count as outside, e.g. the button that opened the row. */
    ignore?: () => (HTMLElement | null | undefined)[]
    /** While true, nothing dismisses: a layer above this one is open and owns the press. */
    paused?: () => boolean
  },
): Attachment<HTMLElement> {
  return (node) => {
    const inside = (target: Node): boolean =>
      node.contains(target) || (opts?.ignore?.() ?? []).some((other) => other?.contains(target) === true)

    const onPointerDown = (event: PointerEvent) => {
      if (opts?.paused?.() !== true && !inside(event.target as Node)) {
        close()
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // One layer per press: while something above is up, Escape is its own to answer.
      if (event.key === 'Escape' && opts?.paused?.() !== true) {
        close()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)

    if (opts?.escape === true) {
      document.addEventListener('keydown', onKeyDown)
    }

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }
}
