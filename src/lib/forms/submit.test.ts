/**
 * The rule worth one place: only the submit itself is an offline failure. A throw from the success
 * work means the send already landed, and calling that offline invites a duplicate of it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitForm } from './submit'

let online = false
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => online }))

const dead = () => Promise.reject(new TypeError('Failed to fetch'))

// Order independence: a case that sets `online` must not leak into the next one if it throws first.
afterEach(() => {
  online = false
})

describe('submitForm', () => {
  it('reports a successful submit and runs the success work', async () => {
    const onSuccess = vi.fn()

    expect(await submitForm(() => Promise.resolve(true), onSuccess)).toBe('submitted')
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('is fine with no success work at all, which the offline-only callers pass', async () => {
    expect(await submitForm(() => Promise.resolve(true))).toBe('submitted')
  })

  it('reports a rejected submit and leaves the success work alone', async () => {
    const onSuccess = vi.fn()

    expect(await submitForm(() => Promise.resolve(false), onSuccess)).toBe('rejected')
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('reports a dead network as offline rather than throwing', async () => {
    expect(await submitForm(dead)).toBe('offline')
  })

  it('does NOT call the success work when the submit never landed', async () => {
    const onSuccess = vi.fn()

    await submitForm(dead, onSuccess)

    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('lets a throw from the success work escape EVEN WHILE OFFLINE, when everything else is offline', async () => {
    const after = () => Promise.reject(new TypeError('Failed to fetch'))

    // The same TypeError that would read as offline from the submit must not read as offline here.
    await expect(submitForm(() => Promise.resolve(true), after)).rejects.toThrow('Failed to fetch')
  })

  it('rethrows a server failure when the connection is up', async () => {
    online = true
    const boom = () => Promise.reject(new Error('500'))

    await expect(submitForm(boom)).rejects.toThrow('500')
  })

  it('still calls a failure offline when the connection is known to be down', async () => {
    // `isOfflineFailure` is `TypeError || !online` on purpose: offline, the cause does not matter.
    expect(await submitForm(() => Promise.reject(new Error('500')))).toBe('offline')
  })
})
