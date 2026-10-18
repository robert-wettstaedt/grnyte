import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETING_HOLD_MS, holdWhileDeleting, whileDeleting } from './deleting.svelte'
import type { QueryPhase, QueryResource } from './resource.svelte'

type Row = { name: string }

/** A detail resource whose row the test adds and removes, as a sync would. */
function fakeResource(initial: Row | undefined) {
  let row = $state(initial)
  const resource: QueryResource<Row | undefined> = {
    get data() {
      return row
    },
    get phase(): QueryPhase {
      return { empty: row == null, kind: 'answered' }
    },
  }
  return { resource, set: (next: Row | undefined) => (row = next) }
}

/** A delete that stays in flight until the test settles it. */
function pendingDelete(id: number) {
  let settle!: () => void
  const done = whileDeleting('routes', id, () => new Promise<object>((resolve) => (settle = () => resolve({}))))
  return async () => {
    settle()
    await done
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('holdWhileDeleting', () => {
  it('keeps the last row when it vanishes under this client delete, and says so after the hold', async () => {
    const { resource, set } = fakeResource({ name: 'Odin' })
    const held = holdWhileDeleting(resource, 'routes', () => 7)
    expect(held.data).toEqual({ name: 'Odin' })

    const finish = pendingDelete(7)
    set(undefined)

    expect(held.data).toEqual({ name: 'Odin' })
    expect(held.phase).toEqual({ empty: false, kind: 'answered' })
    expect(held.deleting).toBe(false)

    vi.advanceTimersByTime(DELETING_HOLD_MS)
    expect(held.deleting).toBe(true)

    // Still held once the delete has answered: the navigation away has not finished yet.
    await finish()
    expect(held.data).toEqual({ name: 'Odin' })
  })

  it('says it is deleting once a slow delete outlasts the hold, before the row has gone', async () => {
    const { resource } = fakeResource({ name: 'Odin' })
    const held = holdWhileDeleting(resource, 'routes', () => 7)
    expect(held.data).toEqual({ name: 'Odin' })

    const finish = pendingDelete(7)
    expect(held.deleting).toBe(false)

    vi.advanceTimersByTime(DELETING_HOLD_MS)
    expect(held.deleting).toBe(true)
    await finish()
  })

  it('answers a second delete of the same entity without running it', async () => {
    const finish = pendingDelete(7)
    const second = vi.fn(async () => ({ data: 'snapshot' }))

    expect(await whileDeleting('routes', 7, second)).toEqual({})
    expect(second).not.toHaveBeenCalled()
    await finish()
  })

  it('reads a row gone under anyone else delete as gone', () => {
    const { resource, set } = fakeResource({ name: 'Odin' })
    const held = holdWhileDeleting(resource, 'routes', () => 7)
    expect(held.data).toEqual({ name: 'Odin' })

    set(undefined)

    expect(held.data).toBeUndefined()
    expect(held.phase).toEqual({ empty: true, kind: 'answered' })
  })

  it('reads a row absent from the start as gone, even while a delete runs', async () => {
    const { resource } = fakeResource(undefined)
    const held = holdWhileDeleting(resource, 'routes', () => 7)
    const finish = pendingDelete(7)

    expect(held.data).toBeUndefined()
    expect(held.phase).toEqual({ empty: true, kind: 'answered' })
    await finish()
  })

  it('holds nothing for a refused delete, whose row never leaves', async () => {
    const { resource } = fakeResource({ name: 'Odin' })
    const held = holdWhileDeleting(resource, 'routes', () => 7)
    expect(held.data).toEqual({ name: 'Odin' })

    const finish = pendingDelete(7)
    vi.advanceTimersByTime(DELETING_HOLD_MS)
    await finish()

    expect(held.deleting).toBe(false)
    expect(held.data).toEqual({ name: 'Odin' })
  })
})
