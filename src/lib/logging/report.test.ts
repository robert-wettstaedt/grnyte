import { beforeEach, describe, expect, it, vi } from 'vitest'

const logClientError = vi.fn().mockResolvedValue(undefined)
vi.mock('./errors.remote', () => ({ logClientError }))

const isOnline = vi.fn()
vi.mock('$lib/state/online.svelte', () => ({ isOnline }))

const { reportClientError, reportIfOnline } = await import('./report')

/** The send is a dynamic import away, so let the microtasks behind it run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('reportIfOnline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('reports when the app can reach something', async () => {
    isOnline.mockReturnValue(true)

    reportIfOnline(new Error(`online ${crypto.randomUUID()}`))
    await settle()

    expect(logClientError).toHaveBeenCalledOnce()
  })

  // A background call that fails offline is the network saying no, and a PWA opened at a crag
  // would write one of these every load.
  it('stays quiet when it cannot', async () => {
    isOnline.mockReturnValue(false)

    reportIfOnline(new Error(`offline ${crypto.randomUUID()}`))
    await settle()

    expect(logClientError).not.toHaveBeenCalled()
  })
})

describe('reportClientError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // A `[scope]` row is only greppable if the label opens the message: with the error's own name or
  // a stack frame in front of it, a prefix match never sees it.
  it('opens the message with the scope it was given', async () => {
    reportClientError(new TypeError(`blocked ${crypto.randomUUID()}`), 'sw')
    await settle()

    expect(logClientError.mock.calls[0][0].error.startsWith('[sw] ')).toBe(true)
  })

  // Covers the dedupe itself, NOT the ordering it depends on: vitest resolves the mocked dynamic
  // import eagerly, so marking before or after the import is indistinguishable here. Measured, not
  // assumed: with the mark moved after the import this still reports 1. The ordering itself was
  // verified in the real app instead, three synchronous calls before the first import resolved
  // writing exactly one row.
  it('sends one report when the same error fires repeatedly', async () => {
    const error = new Error(`loop ${crypto.randomUUID()}`)

    reportClientError(error)
    reportClientError(error)
    reportClientError(error)
    await settle()

    expect(logClientError).toHaveBeenCalledOnce()
  })
})
