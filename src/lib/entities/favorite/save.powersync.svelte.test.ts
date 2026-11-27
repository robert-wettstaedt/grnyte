import { flushSync } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createSaveState, type SaveState } from './save.powersync.svelte'

const read = $state({ answered: true, count: 0, saved: false })
const pending: (() => void)[] = []
const sent: { entityId: number; saved: boolean }[] = []
const route = $state({ id: 7 })

vi.mock('./resources.powersync.svelte', () => ({
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
vi.mock('./writes', () => ({
  saveFavorite: (args: { entityId: number; saved: boolean }) => {
    sent.push(args)
    return new Promise<void>((resolve) => pending.push(resolve))
  },
}))
vi.mock('$lib/state/toast', () => ({ notifyError: vi.fn() }))

let state: SaveState
let cleanup: () => void

beforeEach(() => {
  read.answered = true
  read.saved = false
  read.count = 4
  pending.length = 0
  sent.length = 0
  route.id = 7
  cleanup = $effect.root(() => {
    state = createSaveState(
      () => 1,
      () => 'route',
      () => route.id,
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

it('stays unsaved after a save and its undo, when the save syncs back while the undo is out', () => {
  void state.toggle()
  void state.toggle()
  flushSync()
  read.saved = true
  read.count = 5
  flushSync()

  expect(state.saved).toBe(false)
  expect(state.count).toBe(4)
})

it('sends a waiting tap for the route it was made on, after the page moved to another route', async () => {
  void state.toggle()
  void state.toggle()
  route.id = 8
  flushSync()
  await vi.waitFor(() => expect(pending).toHaveLength(1))
  pending[0]()
  await vi.waitFor(() => expect(sent).toHaveLength(2))

  expect(sent.map(({ entityId, saved }) => [entityId, saved])).toEqual([
    [7, true],
    [7, false],
  ])
})
