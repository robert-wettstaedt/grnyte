import { isTypingInField } from '$lib/components/SiblingNav/siblingNav'
import type { TopoView } from '$lib/entities/topo/dto'
import type { TopoEditor } from '$lib/entities/topo/editor.svelte'
import { anchorX } from '$lib/entities/topo/order'

interface Options {
  editor: TopoEditor
  /** Persist the dirty session. The caller guards on dirty/saving. */
  onSave: () => void
  onToggleFullscreen: () => void
  /** The photos as displayed, for 1..9 selection and the current photo's pixel dims. */
  topos: () => TopoView[]
}

/**
 * Window-keydown handler for the topo editor. Returns a listener for `<svelte:window onkeydown>`,
 * mirroring the sheet's `sheetNavKeydown`. Inert while typing in a field. Shortcuts:
 * Cmd/Ctrl+Z redo/undo, Cmd/Ctrl+S save, Esc deselect, J/L prev/next line, F fullscreen,
 * 1..9 jump to that photo, and the arrows nudge the selected point (preferred) or line by 10px.
 */
export function topoEditorKeydown({ editor, onSave, onToggleFullscreen, topos }: Options) {
  // J/L cycle the drawn lines on the current photo, ordered left-to-right and wrapping. With nothing
  // selected, L grabs the first and J the last.
  function selectSibling(delta: -1 | 1) {
    const drawn = editor.currentLines.filter((line) => line.points.length > 0).sort((a, b) => anchorX(a) - anchorX(b))
    if (drawn.length === 0) return
    const current = drawn.findIndex((line) => line.routeFk === editor.selectedRouteFk)
    const next = current === -1 ? (delta > 0 ? 0 : drawn.length - 1) : (current + delta + drawn.length) % drawn.length
    editor.selectRoute(drawn[next].routeFk)
  }

  // Nudge the selection by 10px in image space. Coords are normalized, so 10px is 10/imageWidth or
  // 10/imageHeight. A selected point wins over the line. `fresh` (the first, non-repeat press) opens
  // one undo step via beginStroke; held auto-repeats coalesce into it.
  function nudge(dx: number, dy: number, fresh: boolean) {
    const current = topos().find((topo) => topo.id === editor.topoId) ?? topos()[0]
    const w = current?.imageWidth
    const h = current?.imageHeight
    if (w == null || h == null || w === 0 || h === 0) return
    if (fresh) editor.beginStroke()
    if (editor.selectedPointId != null) {
      editor.movePointBy(editor.selectedPointId, dx / w, dy / h)
    } else if (editor.selectedRouteFk != null) {
      editor.dragLine(editor.selectedRouteFk, dx / w, dy / h)
    }
  }

  return (event: KeyboardEvent) => {
    // Typing in a field (route name, search): leave native text editing alone.
    if (isTypingInField(event)) return

    const key = event.key.toLowerCase()
    const mod = event.metaKey || event.ctrlKey

    // Modifier combos first, then bail so plain-key shortcuts never hijack Cmd+F, Cmd+arrow, etc.
    if (mod && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) editor.redo()
      else editor.undo()
      return
    }
    // Cmd/Ctrl+S saves (and stops the browser's Save Page dialog).
    if (mod && key === 's') {
      event.preventDefault()
      onSave()
      return
    }
    if (mod) return

    // Esc clears the line selection (back to the no-selection chrome).
    if (key === 'escape') {
      if (editor.selectedRouteFk != null) editor.selectRoute(undefined)
      return
    }
    // J/L cycle the selected line (mirrors the sibling nav's prev/next).
    if (key === 'j' || key === 'l') {
      event.preventDefault()
      selectSibling(key === 'l' ? 1 : -1)
      return
    }
    if (key === 'f') {
      event.preventDefault()
      onToggleFullscreen()
      return
    }
    // 1..9 jump to the photo at that 1-based index (the number shown on each thumbnail).
    if (/^[1-9]$/.test(event.key)) {
      const list = topos()
      const index = Number(event.key) - 1
      if (index < list.length) {
        event.preventDefault()
        editor.topoId = list[index].id
      }
      return
    }
    // Arrow keys nudge the selection, but only when there is one, else leave them to the browser.
    const dx = key === 'arrowleft' ? -10 : key === 'arrowright' ? 10 : 0
    const dy = key === 'arrowup' ? -10 : key === 'arrowdown' ? 10 : 0
    if (dx !== 0 || dy !== 0) {
      if (editor.selectedPointId == null && editor.selectedRouteFk == null) return
      event.preventDefault()
      nudge(dx, dy, !event.repeat)
    }
  }
}
