/**
 * `holdUntilSolved` lets no submit out without a solve, sends a held one once the solve lands, and
 * asks for a fresh solve after every submit that goes out.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { holdUntilSolved } from './submitHold'

let form: HTMLFormElement
let wrapper: HTMLElement
let widget: HTMLElement & { reset: Mock<() => void>; verify: Mock<() => Promise<unknown>> }
let sent: number
let teardown: () => void

const state = (value: string) => widget.dispatchEvent(new CustomEvent('statechange', { detail: { state: value } }))

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = '<form><span></span><button type="submit">Send</button></form>'
  form = document.querySelector('form')!
  wrapper = form.querySelector('span')!
  widget = Object.assign(document.createElement('div'), {
    reset: vi.fn<() => void>(),
    verify: vi.fn(async (): Promise<unknown> => undefined),
  })
  wrapper.append(widget)
  sent = 0
  // Stands in for the remote form's own handler, which runs after the hold's capture listener.
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    sent += 1
  })
  teardown = holdUntilSolved(wrapper, () => widget)
})

afterEach(() => {
  teardown()
  vi.useRealTimers()
})

describe('holdUntilSolved', () => {
  it('holds a submit made before the solve and sends it once the solve lands', () => {
    form.requestSubmit()
    expect(sent).toBe(0)

    state('verifying')
    expect(sent).toBe(0)
    state('verified')
    expect(sent).toBe(1)
  })

  it('lets a submit through once solved, then starts a fresh solve for the next one', () => {
    state('verified')
    form.requestSubmit()
    expect(sent).toBe(1)

    vi.runAllTimers()
    expect(widget.reset).toHaveBeenCalledOnce()
    expect(widget.verify).toHaveBeenCalledOnce()

    form.requestSubmit()
    expect(sent).toBe(1)
  })

  it.each(['unverified', 'expired', 'error'])('restarts the solve for a submit held in %s', (resting) => {
    state(resting)
    form.requestSubmit()
    expect(widget.verify).toHaveBeenCalledOnce()
  })

  it('does not restart a solve that is already running', () => {
    state('verifying')
    form.requestSubmit()
    expect(widget.verify).not.toHaveBeenCalled()
  })

  it('holds a submit the widget refused as invalid, and nothing it did not own', () => {
    const inside = new Event('invalid', { cancelable: true })
    widget.dispatchEvent(inside)
    expect(inside.defaultPrevented).toBe(true)

    const input = document.createElement('input')
    form.prepend(input)
    const outside = new Event('invalid', { cancelable: true })
    input.dispatchEvent(outside)
    expect(outside.defaultPrevented).toBe(false)

    state('verified')
    expect(sent).toBe(1)
  })

  it('sends a held submit once, not again when the next solve lands', () => {
    form.requestSubmit()
    state('verified')
    vi.runAllTimers()
    state('verified')
    expect(sent).toBe(1)
  })

  it('holds a submit made before the widget has loaded, then sends it once it solves', () => {
    const empty = document.createElement('form')
    const slot = document.createElement('span')
    empty.append(slot)
    document.body.append(empty)
    let late: HTMLElement | null = null
    let early = 0
    empty.addEventListener('submit', (event) => {
      event.preventDefault()
      early += 1
    })
    const release = holdUntilSolved(slot, () => late as never)

    expect(() => empty.requestSubmit()).not.toThrow()
    expect(early).toBe(0)

    late = Object.assign(document.createElement('div'), { reset: vi.fn(), verify: vi.fn(async () => {}) })
    slot.append(late)
    late.dispatchEvent(new CustomEvent('statechange', { detail: { state: 'verified' } }))
    expect(early).toBe(1)
    release()
  })

  it('lets go of the form entirely once torn down', () => {
    form.requestSubmit()
    teardown()

    state('verified')
    expect(sent).toBe(0)
    const invalid = new Event('invalid', { cancelable: true })
    widget.dispatchEvent(invalid)
    expect(invalid.defaultPrevented).toBe(false)
    form.requestSubmit()
    expect(sent).toBe(1)
  })

  it('leaves a wrapper outside any form alone', () => {
    const loose = document.createElement('span')
    document.body.append(loose)
    expect(() => holdUntilSolved(loose, () => widget)()).not.toThrow()
  })
})
