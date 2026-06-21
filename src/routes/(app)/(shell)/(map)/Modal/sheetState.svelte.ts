import type { Snippet } from 'svelte'

let _title = $state<Snippet | string | null>(null)
let _subtitle = $state<Snippet | string | null>(null)
let _headerLeft = $state<Snippet | null>(null)
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
  get requestSnap() {
    return _requestSnap
  },
  set requestSnap(value: 0.25 | 0.5 | 0.75 | null) {
    _requestSnap = value
  },
}
