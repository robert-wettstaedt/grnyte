import { flushSync } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createWanted, type Wanted } from './wanted.svelte'

const notifyError = vi.hoisted(() => vi.fn())
vi.mock('$lib/state/toast/toast', () => ({ notifyError }))
const forgetUnanswered = vi.hoisted(() => vi.fn())
vi.mock('$lib/zero/write', () => ({ forgetUnanswered }))

const row = $state({ id: 'a', on: false })
let wanted: Wanted<boolean>
let cleanup: () => void

/** A write the case settles by hand. */
function pending() {
  let settle = { reject: (_: unknown) => {}, resolve: () => {} }
  const promise = new Promise<void>((resolve, reject) => (settle = { reject, resolve }))
  return { promise, ...settle }
}

beforeEach(() => {
  row.id = 'a'
  row.on = false
  notifyError.mockClear()
  forgetUnanswered.mockClear()
  cleanup = $effect.root(() => {
    wanted = createWanted(
      () => row.on,
      () => row.id,
    )
  })
  flushSync()
})

afterEach(() => cleanup())

it('shows a tap at once, before its write returns', () => {
  void wanted.set(true, () => pending().promise)
  flushSync()

  expect(wanted.value).toBe(true)
})

it('keeps the tap after its write returns, until the read agrees', async () => {
  await wanted.set(true, async () => {})
  flushSync()

  expect(wanted.value).toBe(true)
})

it('follows the read again once it agrees, so a later change from elsewhere shows', async () => {
  await wanted.set(true, async () => {})
  row.on = true
  flushSync()
  row.on = false
  flushSync()

  expect(wanted.value).toBe(false)
})

it('keeps the last tap while a write is out, even when an earlier tap syncs back', () => {
  void wanted.set(true, () => pending().promise)
  void wanted.set(false, () => pending().promise)
  flushSync()
  row.on = true
  flushSync()

  expect(wanted.value).toBe(false)
})

it('goes back and shows the error when its write fails', async () => {
  const refused = new Error('refused')
  await wanted.set(true, () => Promise.reject(refused))
  flushSync()

  expect(wanted.value).toBe(false)
  expect(notifyError).toHaveBeenCalledWith(refused)
})

it('keeps a later tap when an earlier write fails', async () => {
  const first = pending()
  const failed = wanted.set(true, () => first.promise)
  void wanted.set(false, () => pending().promise)
  void wanted.set(true, () => pending().promise)
  first.reject(new Error('refused'))
  await failed
  flushSync()

  expect(wanted.value).toBe(true)
})

it('shows the read of another row the same helper moved on to', () => {
  void wanted.set(true, () => pending().promise)
  row.id = 'b'
  flushSync()

  expect(wanted.value).toBe(false)
})

it('sends a tap only after the write before it has settled, so the last tap wins on the server', async () => {
  const first = pending()
  const second = vi.fn(async () => {})
  void wanted.set(true, () => first.promise)
  const last = wanted.set(false, second)
  await Promise.resolve()

  expect(second).not.toHaveBeenCalled()

  first.resolve()
  await last
  flushSync()

  expect(second).toHaveBeenCalledOnce()
  expect(wanted.value).toBe(false)
})

it('forgets a kept write id when it appears, since the row may have changed unwatched, and when its row changes', () => {
  expect(forgetUnanswered).toHaveBeenCalledOnce()

  row.on = true
  flushSync()

  expect(forgetUnanswered).toHaveBeenCalledTimes(2)
})

it('does not forget when the read reruns with the same value', () => {
  const box = $state({ file: { on: false } })
  const stop = $effect.root(() => {
    createWanted(
      () => box.file.on,
      () => 'file',
    )
  })
  flushSync()
  forgetUnanswered.mockClear()

  box.file = { on: false }
  flushSync()

  expect(forgetUnanswered).not.toHaveBeenCalled()
  stop()
})
