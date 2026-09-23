/**
 * The capture through its own interface, over a fake `beforeNavigate`. The window's TIMING is the
 * whole risk here and it is what these pin: armed across the submit, shut immediately after, and
 * shut even when the submit throws.
 */
import { describe, expect, it, vi } from 'vitest'
import { createRedirectCapture, type CapturedNavigation } from './redirectCapture.svelte'

const FORM_PATH = '/routes/5/ascents/add'

/** A capture over a fake register, plus a way to fire navigations at it. */
const harness = (path = FORM_PATH) => {
  let handler: (navigation: CapturedNavigation) => void = () => {}
  const capture = createRedirectCapture(
    (fn) => {
      handler = fn
    },
    () => path,
    () => Promise.resolve(),
  )

  /** Fire one navigation at the handler and report whether it was cancelled. */
  const navigate = (to: string, { from = path, type = 'goto' } = {}) => {
    const cancel = vi.fn()
    handler({
      cancel,
      from: { url: new URL(from, 'https://grnyte.rocks') },
      to: { url: new URL(to, 'https://grnyte.rocks') },
      type,
    })
    return { cancelled: cancel.mock.calls.length > 0 }
  }

  return { capture, navigate }
}

describe('while the submit is in flight', () => {
  it('takes the redirect and cancels it, so nothing is pushed', async () => {
    const { capture, navigate } = harness()
    let cancelled = false

    await capture.around(() => {
      ;({ cancelled } = navigate('/routes/5'))
      return Promise.resolve(true)
    })

    expect(cancelled, 'the push must not happen').toBe(true)
    expect(capture.take()).toBe('/routes/5')
  })

  it('keeps the query, which is part of where the reader lands', async () => {
    const { capture, navigate } = harness()

    await capture.around(() => {
      navigate('/feed?region=2')
      return Promise.resolve(true)
    })

    expect(capture.take()).toBe('/feed?region=2')
  })

  it('leaves a link the reader taps alone, because it starts from another screen', async () => {
    const { capture, navigate } = harness()
    let cancelled = true

    await capture.around(() => {
      ;({ cancelled } = navigate('/feed', { from: '/somewhere/else' }))
      return Promise.resolve(true)
    })

    expect(cancelled, "the reader's own navigation must proceed").toBe(false)
    expect(capture.take()).toBeUndefined()
  })

  // Kit reports a navigation off the origin with `to: null`, and one it did not start with no
  // `from`. Neither is ours to take, and reading through them would throw inside `beforeNavigate`.
  it('ignores a navigation leaving the origin, which has no destination', async () => {
    const { capture } = harness()
    let handler: (navigation: CapturedNavigation) => void = () => {}
    const local = createRedirectCapture(
      (fn) => {
        handler = fn
      },
      () => FORM_PATH,
      () => Promise.resolve(),
    )

    await local.around(() => {
      handler({ cancel: () => {}, from: { url: new URL(FORM_PATH, 'https://grnyte.rocks') }, to: null, type: 'goto' })
      return Promise.resolve(true)
    })

    expect(local.take()).toBeUndefined()
    expect(capture.take()).toBeUndefined()
  })

  it('ignores a navigation with no origin screen', async () => {
    let handler: (navigation: CapturedNavigation) => void = () => {}
    const local = createRedirectCapture(
      (fn) => {
        handler = fn
      },
      () => FORM_PATH,
      () => Promise.resolve(),
    )
    const cancel = vi.fn()

    await local.around(() => {
      handler({ cancel, from: null, to: { url: new URL('/feed', 'https://grnyte.rocks') }, type: 'goto' })
      return Promise.resolve(true)
    })

    expect(cancel).not.toHaveBeenCalled()
    expect(local.take()).toBeUndefined()
  })

  it('leaves a navigation that is not a programmatic goto alone', async () => {
    const { capture, navigate } = harness()
    let cancelled = true

    await capture.around(() => {
      ;({ cancelled } = navigate('/feed', { type: 'link' }))
      return Promise.resolve(true)
    })

    expect(cancelled).toBe(false)
    expect(capture.take()).toBeUndefined()
  })
})

describe('the window', () => {
  // The regression this module exists behind a seam for. Held open one line too long, the capture
  // cancels the CALLER's own navigation and re-issues it, which turned every page-issued push into
  // a pop and was invisible to types, unit tests and two review rounds.
  it('is shut once the submit resolves, so the caller can navigate for itself', async () => {
    const { capture, navigate } = harness()

    await capture.around(() => Promise.resolve(true))
    const { cancelled } = navigate('/routes/5')

    expect(cancelled, "the caller's own navigation must not be cancelled").toBe(false)
    expect(capture.take()).toBeUndefined()
  })

  it('is shut even when the submit throws', async () => {
    const { capture, navigate } = harness()

    await expect(capture.around(() => Promise.reject(new Error('offline')))).rejects.toThrow('offline')

    expect(navigate('/routes/5').cancelled).toBe(false)
  })

  it('is shut before it opens, so a navigation from an earlier screen is not caught', () => {
    const { capture, navigate } = harness()

    expect(navigate('/routes/5').cancelled).toBe(false)
    expect(capture.take()).toBeUndefined()
  })
})

describe('take', () => {
  it('yields the destination once and then forgets it', async () => {
    const { capture, navigate } = harness()

    await capture.around(() => {
      navigate('/routes/5')
      return Promise.resolve(true)
    })

    expect(capture.take()).toBe('/routes/5')
    expect(capture.take(), 'a second submit must not inherit the first destination').toBeUndefined()
  })

  it('forgets a previous destination when a new submit starts', async () => {
    const { capture, navigate } = harness()

    await capture.around(() => {
      navigate('/routes/5')
      return Promise.resolve(true)
    })
    await capture.around(() => Promise.resolve(true))

    expect(capture.take(), 'this submit redirected nowhere').toBeUndefined()
  })
})
