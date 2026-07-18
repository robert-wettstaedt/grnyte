import type { SheetNav } from '$lib/components/SiblingNav/siblingNav'
import type { Snippet } from 'svelte'

let _title = $state<null | Snippet | string>(null)
let _subtitle = $state<null | Snippet | string>(null)
let _headerLeft = $state<null | Snippet>(null)
let _toolbar = $state<null | Snippet>(null)
let _nav = $state<null | SheetNav>(null)
let _requestSnap = $state<0.25 | 0.5 | 0.75 | null>(null)
let _startingSnap = $state<0.25 | 0.5 | 0.75 | null>(null)
let _sheetTop = $state<null | number>(null)

export const sheetState = {
  get headerLeft() {
    return _headerLeft
  },
  set headerLeft(value: null | Snippet) {
    _headerLeft = value
  },
  get nav() {
    return _nav
  },
  set nav(value: null | SheetNav) {
    _nav = value
  },
  get requestSnap() {
    return _requestSnap
  },
  set requestSnap(value: 0.25 | 0.5 | 0.75 | null) {
    _requestSnap = value
  },
  /** Viewport offset of the mobile sheet's top edge, live-updated as it's dragged
   *  or snapped. Lets the page behind size itself to the uncovered area (e.g. the
   *  topo viewer). Null on desktop or while no sheet is mounted. */
  get sheetTop() {
    return _sheetTop
  },
  set sheetTop(value: null | number) {
    _sheetTop = value
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
  get subtitle() {
    return _subtitle
  },
  set subtitle(value: null | Snippet | string) {
    _subtitle = value
  },
  get title() {
    return _title
  },
  set title(value: null | Snippet | string) {
    _title = value
  },
  /** Optional second header row (e.g. filter/sort controls), pinned above the scroll area. */
  get toolbar() {
    return _toolbar
  },
  set toolbar(value: null | Snippet) {
    _toolbar = value
  },
}
