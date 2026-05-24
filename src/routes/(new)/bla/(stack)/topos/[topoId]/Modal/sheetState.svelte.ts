let _requestSnap = $state<number | null>(null)

export const sheetState = {
  get requestSnap() {
    return _requestSnap
  },
  set requestSnap(value: number | null) {
    _requestSnap = value
  },
}
