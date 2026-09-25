import type { SheetNav } from '$lib/components/SiblingNav/siblingNav'
import type { Snippet } from 'svelte'

let _title = $state<null | Snippet | string>(null)
let _subtitle = $state<null | Snippet | string>(null)
let _headerLeft = $state<null | Snippet>(null)
let _toolbar = $state<null | Snippet>(null)
let _nav = $state<null | SheetNav>(null)
let _requestSnap = $state<0.25 | 0.5 | 0.75 | null>(null)
let _showOnMapRequest = $state(0)
let _canShowOnMap = $state(false)
let _startingSnap = $state<0.25 | 0.5 | 0.75 | null>(null)
let _sheetTop = $state<null | number>(null)

export const sheetState = {
  /** Whether the map has a framing for the open entity. Published by the `(map)` layout, the one
   *  thing that knows. A page's own "has a location" disagrees in both directions. */
  get canShowOnMap() {
    return _canShowOnMap
  },
  set canShowOnMap(value: boolean) {
    _canShowOnMap = value
  },
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
  /** Top edge of the mobile sheet inside `[data-app-frame]` (not the viewport: the status
   *  bar pushes the frame down), live as it's dragged. Lets the page behind size itself to
   *  the uncovered area. Null on desktop or while no sheet is mounted. */
  get sheetTop() {
    return _sheetTop
  },
  set sheetTop(value: null | number) {
    _sheetTop = value
  },
  /** Bumped when the reader asks to show the open entity on the map. A counter, not a flag, because
   *  the value goes into the camera claim and a repeat press must be a fresh claim. */
  get showOnMapRequest() {
    return _showOnMapRequest
  },
  set showOnMapRequest(value: number) {
    _showOnMapRequest = value
  },
  /** Where the mobile sheet opens (default 0.75). Read once when the sheet mounts,
   *  so pages that want to start low (e.g. the topo viewer) must set it in their
   *  script body (before their Modal child initialises), not in an effect. */
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
