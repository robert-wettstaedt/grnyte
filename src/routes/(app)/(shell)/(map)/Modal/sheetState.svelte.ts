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
}
