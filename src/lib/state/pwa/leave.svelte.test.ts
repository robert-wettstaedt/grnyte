import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Queued writes of every account on the device, as the engine counts them after its chance to send. */
const engine = vi.hoisted(() => ({ refreshQueued: vi.fn(async () => 0) }))
vi.mock('$lib/state/engine', () => engine)
const wipe = vi.hoisted(() => ({ tellOtherTabsSignedOut: vi.fn(), wipeAndLeave: vi.fn(async () => {}) }))
vi.mock('./wipe', () => wipe)

const { askedCount, leaveAfterSignOut, mayDiscard, question } = await import('./leave.svelte')

beforeEach(() => {
  engine.refreshQueued.mockReset().mockResolvedValue(0)
  wipe.wipeAndLeave.mockClear()
})

describe('signing out with writes still queued', () => {
  it('goes ahead at once with none, after the engine had its chance to send them', async () => {
    expect(await mayDiscard()).toBe(true)
    expect(engine.refreshQueued).toHaveBeenCalledOnce()
    expect(question()).toBeUndefined()
  })

  it('asks with one left and goes ahead on "sign out anyway"', async () => {
    engine.refreshQueued.mockResolvedValue(1)
    const answer = mayDiscard()
    await vi.waitFor(() => expect(question()?.count).toBe(1))

    question()!.answer(true)

    expect(await answer).toBe(true)
    expect(question()).toBeUndefined()
    expect(askedCount()).toBe(1)
  })

  it('signs nothing out on "wait"', async () => {
    engine.refreshQueued.mockResolvedValue(2)
    const submit = vi.fn(async () => true)
    const leaving = leaveAfterSignOut()({ submit })
    await vi.waitFor(() => expect(question()?.count).toBe(2))

    question()!.answer(false)
    await leaving

    expect(submit).not.toHaveBeenCalled()
    expect(wipe.wipeAndLeave).not.toHaveBeenCalled()
  })
})
