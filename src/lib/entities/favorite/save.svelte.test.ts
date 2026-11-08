import { flushSync } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createSaveState, type SaveState } from './save.svelte'

const read = $state({ answered: true, count: 0, saved: false })
const pending: (() => void)[] = []

vi.mock('./resources.svelte', () => ({
  isFavorited: () => ({
    get data() {
      return read.saved
    },
    phase: { empty: false, kind: 'answered' },
  }),
  saveCount: () => ({
    get data() {
      return read.count
    },
    get phase() {
      return read.answered ? { empty: false, kind: 'answered' } : { kind: 'arriving' }
    },
  }),
}))
vi.mock('./writes', () => ({ saveFavorite: () => new Promise<void>((resolve) => pending.push(resolve)) }))
vi.mock('$lib/state/toast', () => ({ notifyError: vi.fn() }))

let state: SaveState
let cleanup: () => void

beforeEach(() => {
  read.answered = true
  read.saved = false
  read.count = 4
  pending.length = 0
  cleanup = $effect.root(() => {
    state = createSaveState(
      () => 1,
      () => 'route',
      () => 7,
    )
  })
  flushSync()
})

afterEach(() => cleanup())

it('shows the read count again after a save and its undo, both still unsynced', () => {
  void state.toggle()
  void state.toggle()
  flushSync()

  expect(state.saved).toBe(false)
  expect(state.count).toBe(4)
})

it('counts a save once when its row syncs back before the write returns', () => {
  void state.toggle()
  read.saved = true
  read.count = 5
  flushSync()

  expect(state.count).toBe(5)
})

it('shows no count until the count answers, even with a save on its way', () => {
  read.answered = false
  void state.toggle()
  flushSync()

  expect(state.count).toBe(0)
})
