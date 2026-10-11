import { PillSurface } from '$lib/state/pill.svelte'
import { render } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PillHost from './PillHost.svelte'

vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
// jsdom has no ResizeObserver; nothing here depends on a measured size.
vi.stubGlobal(
  'ResizeObserver',
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
)

/** What the pill announces right now, which is what it shows. */
const announced = (container: HTMLElement) => container.querySelector('[role=status]')?.textContent ?? ''

const advance = (ms: number) => {
  vi.advanceTimersByTime(ms)
  flushSync()
}

describe('a surface pill', () => {
  let surface: PillSurface
  let container: HTMLElement

  beforeEach(() => {
    vi.useFakeTimers()
    surface = new PillSurface()
    container = render(PillHost, { surface }).container
    flushSync()
  })

  afterEach(() => vi.useRealTimers())

  it('waits 250 ms before showing a status', () => {
    surface.hold({})
    flushSync()
    advance(200)
    expect(announced(container)).toBe('')
    advance(60)
    expect(announced(container)).toBe('Loading…')
  })

  it('does not restart the delay when one kind hands over to another', () => {
    surface.hold({})
    flushSync()
    advance(200)
    surface.offer(() => ({ kind: 'status', label: 'Loading map…' }))
    flushSync()
    advance(60)
    expect(announced(container)).toBe('Loading map…')
  })

  it('shows an action at once', () => {
    surface.offer(() => ({ icon: 'arrow-up-down', kind: 'action', label: '3 new', onclick: () => {} }))
    flushSync()
    expect(announced(container)).toBe('3 new')
  })

  it('lingers with the latest label, and a lingering action does nothing when tapped', () => {
    let count = $state(3)
    const onclick = vi.fn()
    const withdraw = surface.offer(() => ({ icon: 'arrow-up-down', kind: 'action', label: `${count} new`, onclick }))
    flushSync()
    count = 7
    flushSync()
    withdraw()
    flushSync()
    expect(announced(container)).toBe('7 new')
    container.querySelector('button')?.click()
    expect(onclick).not.toHaveBeenCalled()
    advance(250)
    expect(announced(container)).toBe('')
  })

  it('shows again at once when wanted back during the linger', () => {
    const release = surface.hold({})
    flushSync()
    advance(300)
    release()
    flushSync()
    advance(100)
    surface.hold({})
    flushSync()
    expect(announced(container)).toBe('Loading…')
  })

  it('starts the delay over when a status released before it ran out is wanted again', () => {
    const release = surface.hold({})
    flushSync()
    advance(100)
    release()
    flushSync()
    advance(140)
    surface.hold({})
    flushSync()
    advance(20)
    expect(announced(container)).toBe('')
    advance(240)
    expect(announced(container)).toBe('Loading…')
  })

  it('falls back to syncing at once when an action leaves while something still syncs', () => {
    surface.hold({})
    const withdraw = surface.offer(() => ({ icon: 'arrow-up-down', kind: 'action', label: '3 new', onclick: () => {} }))
    flushSync()
    withdraw()
    flushSync()
    expect(announced(container)).toBe('Loading…')
  })
})
