import type { Snippet } from 'svelte'

/** Prev/next navigation between sibling entities. Each modal renders it in its own
 *  layout (mobile: a pill at the sheet edge; desktop: arrows on the card edges). */
export interface SheetNav {
  prev: { href: string; label: string }
  next: { href: string; label: string }
  position: number
  total: number
}

let _title = $state<Snippet | string | null>(null)
let _subtitle = $state<Snippet | string | null>(null)
let _headerLeft = $state<Snippet | null>(null)
let _toolbar = $state<Snippet | null>(null)
let _nav = $state<SheetNav | null>(null)
let _requestSnap = $state<0.25 | 0.5 | 0.75 | null>(null)
let _startingSnap = $state<0.25 | 0.5 | 0.75 | null>(null)
let _sheetTop = $state<number | null>(null)

export const sheetState = {
  get title() {
    return _title
  },
  set title(value: Snippet | string | null) {
    _title = value
  },
  get subtitle() {
    return _subtitle
  },
  set subtitle(value: Snippet | string | null) {
    _subtitle = value
  },
  get headerLeft() {
    return _headerLeft
  },
  set headerLeft(value: Snippet | null) {
    _headerLeft = value
  },
  /** Optional second header row (e.g. filter/sort controls), pinned above the scroll area. */
  get toolbar() {
    return _toolbar
  },
  set toolbar(value: Snippet | null) {
    _toolbar = value
  },
  get nav() {
    return _nav
  },
  set nav(value: SheetNav | null) {
    _nav = value
  },
  get requestSnap() {
    return _requestSnap
  },
  set requestSnap(value: 0.25 | 0.5 | 0.75 | null) {
    _requestSnap = value
  },
  /** Where the mobile sheet opens (default 0.75). Read once when the sheet mounts,
   *  so pages that want to start low (e.g. the topo viewer) must set it in their
   *  script body — before their Modal child initialises — not in an effect. */
  get startingSnap() {
    return _startingSnap
  },
  set startingSnap(value: 0.25 | 0.5 | 0.75 | null) {
    _startingSnap = value
  },
  /** Viewport offset of the mobile sheet's top edge, live-updated as it's dragged
   *  or snapped. Lets the page behind size itself to the uncovered area (e.g. the
   *  topo viewer). Null on desktop or while no sheet is mounted. */
  get sheetTop() {
    return _sheetTop
  },
  set sheetTop(value: number | null) {
    _sheetTop = value
  },
}
