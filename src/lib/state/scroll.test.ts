import { describe, expect, it } from 'vitest'
import {
  createScrollSurface,
  onNavigation,
  resetOnNavigate,
  type NavigationKind,
  type ScrollContainer,
  type ScrollTiming,
} from './scroll'

interface Fake extends ScrollContainer {
  /** Grow the content, as syncing rows do. */
  grow: (scrollHeight: number) => void
  /** Fire a reader gesture, as the browser would. */
  interact: (type?: Interaction) => void
}

type Interaction = 'keydown' | 'pointerdown' | 'touchstart' | 'wheel'

/** A container that clamps like a real element: a write past the maximum lands at the maximum. */
const fakeContainer = (scrollHeight = 2000, clientHeight = 800): Fake => {
  const handlers = new Map<Interaction, Set<() => void>>()
  let height = scrollHeight
  let top = 0

  return {
    addEventListener: (type, handler) => {
      const set = handlers.get(type) ?? new Set()
      set.add(handler)
      handlers.set(type, set)
    },
    clientHeight,
    grow: (next) => void (height = next),
    interact: (type = 'wheel') => {
      for (const handler of [...(handlers.get(type) ?? [])]) handler()
    },
    removeEventListener: (type, handler) => void handlers.get(type)?.delete(handler),
    get scrollHeight() {
      return height
    },
    get scrollTop() {
      return top
    },
    set scrollTop(value: number) {
      top = Math.max(0, Math.min(value, height - clientHeight))
    },
  }
}

/** A clock and frame loop the test drives by hand. */
const fakeTiming = () => {
  let queued: (() => void) | undefined
  let clock = 0

  const timing: ScrollTiming = {
    now: () => clock,
    schedule: (callback) => {
      queued = callback
      return () => {
        if (queued === callback) queued = undefined
      }
    },
  }

  return {
    /** Run the queued frame, optionally advancing the clock first. */
    frame: (advanceMs = 0) => {
      clock += advanceMs
      const next = queued
      queued = undefined
      next?.()
    },
    get pending() {
      return queued != null
    },
    timing,
  }
}

describe('createScrollSurface', () => {
  it('captures the attached container offset', () => {
    const surface = createScrollSurface()
    const container = fakeContainer()
    surface.attach(container)

    container.scrollTop = 420

    expect(surface.snapshot.capture()).toBe(420)
  })

  it('restores a captured offset', () => {
    const surface = createScrollSurface()
    const container = fakeContainer()
    surface.attach(container)
    container.scrollTop = 420

    const captured = surface.snapshot.capture()
    container.scrollTop = 0
    surface.snapshot.restore(captured)

    expect(container.scrollTop).toBe(420)
  })

  it('restores a never-scrolled entry to the top', () => {
    const surface = createScrollSurface()
    const container = fakeContainer()
    surface.attach(container)
    container.scrollTop = 300

    surface.snapshot.restore(0)

    expect(container.scrollTop).toBe(0)
  })

  // Capture runs on the way out, and for a layout that unmounts it races Svelte's teardown. Losing
  // that race must not mean losing the reader's place, so a detached surface reports where the
  // container was rather than zero. This is what `two scrolled entries restore independently`
  // caught: the form's entry stored 0 and back sent the reader to the top.
  it('captures the last known offset after the container detaches', () => {
    const surface = createScrollSurface()
    const container = fakeContainer()
    const detach = surface.attach(container)
    container.scrollTop = 420

    detach()

    expect(surface.snapshot.capture()).toBe(420)
    expect(() => surface.snapshot.restore(420)).not.toThrow()
  })

  it('captures zero when there was never a container', () => {
    expect(createScrollSurface().snapshot.capture()).toBe(0)
  })

  // The whole round trip across an unmount, which is the shape the e2e failure had: leave a
  // scrolled screen for a different layout tree, come back, land where you were.
  it('survives a container that detaches before capture and reattaches on the way back', () => {
    const surface = createScrollSurface()
    const first = fakeContainer()
    const detach = surface.attach(first)
    first.scrollTop = 925

    // Teardown wins the race, then Kit captures, then the layout remounts.
    detach()
    const stored = surface.snapshot.capture()

    const second = fakeContainer()
    surface.snapshot.restore(stored)
    surface.attach(second)

    expect(second.scrollTop).toBe(925)
  })

  // Detaching is keyed to the element, so a remount that attaches the new one before the old one
  // cleans up does not leave the surface pointing at nothing.
  it('keeps the newer container when attach and detach overlap', () => {
    const surface = createScrollSurface()
    const first = fakeContainer()
    const second = fakeContainer()

    const detachFirst = surface.attach(first)
    surface.attach(second)
    detachFirst()

    second.scrollTop = 120

    expect(surface.snapshot.capture()).toBe(120)
  })
})

/**
 * A layout that unmounts on the way out and remounts on the way back: Kit calls `restore` on the
 * fresh instance before its attachment has bound the new element, so the offset has to wait for it.
 * The persistent-layout tests above cannot see this, because there the element is already attached.
 */
describe('restoring into a layout that has not attached yet', () => {
  it('applies the offset once the container arrives', () => {
    const surface = createScrollSurface()
    const container = fakeContainer()

    surface.snapshot.restore(420)
    surface.attach(container)

    expect(container.scrollTop).toBe(420)
  })

  it('keeps waiting for content when the late container is still short', () => {
    const clock = fakeTiming()
    const surface = createScrollSurface(clock.timing)
    const container = fakeContainer(900)

    surface.snapshot.restore(600)
    surface.attach(container)
    expect(container.scrollTop, 'clamped by the short container').toBe(100)

    container.grow(2000)
    clock.frame(16)

    expect(container.scrollTop).toBe(600)
  })

  it('does not re-apply a stale offset to a later container', () => {
    const surface = createScrollSurface()
    const first = fakeContainer()
    const second = fakeContainer()

    surface.snapshot.restore(420)
    surface.attach(first)()
    surface.attach(second)

    expect(second.scrollTop).toBe(0)
  })
})

/**
 * The restore that matters: content arrives after the route renders, so the first write clamps to a
 * container that is still short. Asserted on a container that STARTS too short to hold the offset,
 * because one tall enough already passes without any of this.
 */
/** A surface whose container starts too short to hold the offset, with a restore already in flight. */
const startedRestore = (offset = 600) => {
  const clock = fakeTiming()
  const surface = createScrollSurface(clock.timing)
  const container = fakeContainer(900)
  surface.attach(container)
  surface.snapshot.restore(offset)
  // Every test below distinguishes a watch that stopped from one that never started.
  expect(clock.pending).toBe(true)
  return { clock, container, surface }
}

describe('restoring against content that has not synced yet', () => {
  it('reaches the offset once the content grows', () => {
    const { frame, timing } = fakeTiming()
    const surface = createScrollSurface(timing)
    const container = fakeContainer(900)
    surface.attach(container)

    surface.snapshot.restore(600)
    expect(container.scrollTop).toBe(100)

    container.grow(2000)
    frame(16)

    expect(container.scrollTop).toBe(600)
  })

  it('stops re-asserting once the offset is reached', () => {
    const { clock, container } = startedRestore()

    container.grow(2000)
    clock.frame(16)

    expect(clock.pending).toBe(false)
  })

  it('gives up at the budget rather than looping forever', () => {
    const { clock, container } = startedRestore()

    for (let elapsed = 0; elapsed < 1_000; elapsed += 100) clock.frame(100)

    expect(container.scrollTop).toBe(100)
    expect(clock.pending).toBe(false)
  })

  it('yields to a reader who scrolls during the window', () => {
    const { clock, container } = startedRestore()

    container.interact()

    expect(clock.pending).toBe(false)

    // The reader is now in charge: content arriving later must not move them.
    container.grow(2000)
    container.scrollTop = 50
    clock.frame(16)

    expect(container.scrollTop).toBe(50)
  })

  it.each(['touchstart', 'wheel', 'pointerdown', 'keydown'] as const)('yields to a %s gesture', (type) => {
    const { clock, container } = startedRestore()

    container.interact(type)

    expect(clock.pending).toBe(false)
  })

  // The single-frame case passes even if the watch stops after one step, so the content here
  // arrives several frames late: that is what makes this a loop rather than one retry.
  it('keeps re-asserting across frames until the content arrives', () => {
    const { clock, container } = startedRestore()

    for (let frame = 0; frame < 3; frame += 1) {
      clock.frame(16)
      expect(container.scrollTop, 'still clamped while the list is short').toBe(100)
      expect(clock.pending, 'and still watching').toBe(true)
    }

    container.grow(2000)
    clock.frame(16)

    expect(container.scrollTop).toBe(600)
  })

  // The feed reproduced this: a list still syncing when a FIXED budget expires leaves the reader
  // part-way, with the rows landing just afterwards. Growth has to buy more time.
  it('keeps waiting while the content is still growing', () => {
    const { clock, container } = startedRestore()

    // Well past a fixed budget, but the list grows a little on every frame.
    for (let height = 950; height < 1_400; height += 50) {
      container.grow(height)
      clock.frame(300)
    }

    expect(clock.pending, 'still watching because the list kept growing').toBe(true)

    container.grow(2000)
    clock.frame(300)

    expect(container.scrollTop).toBe(600)
  })

  // The ceiling on the rule above: content that never stops arriving must not keep the watch alive
  // forever, overriding the browser's own scroll anchoring long after the reader has settled.
  it('stops at the ceiling however long the content keeps growing', () => {
    const { clock, container } = startedRestore()

    // Grows on every frame, but never tall enough to hold 600, so only the ceiling can end it.
    for (let height = 950; height < 1_390; height += 10) {
      container.grow(height)
      clock.frame(300)
    }

    expect(clock.pending, 'the ceiling ends it even though growth never stopped').toBe(false)
    expect(container.scrollTop, 'and it never reached the target').toBeLessThan(600)
  })

  it('gives up once growth stops, not while it continues', () => {
    const { clock, container } = startedRestore()

    container.grow(1_000)
    clock.frame(300)
    expect(clock.pending).toBe(true)

    // Nothing arrives from here on, so the budget runs out from the last growth.
    for (let elapsed = 0; elapsed < 1_200; elapsed += 300) clock.frame(300)

    expect(clock.pending).toBe(false)
  })

  // Pins the budget itself, not just that one exists: a deadline of the wrong length or sign
  // passes every test that only checks the end state.
  it('is still watching just before the budget and done just after', () => {
    const { clock, container } = startedRestore()

    clock.frame(999)
    expect(clock.pending, 'inside the budget').toBe(true)

    clock.frame(2)
    expect(clock.pending, 'past the budget').toBe(false)
    expect(container.scrollTop).toBe(100)
  })

  it('abandons a watch in flight when a newer restore arrives', () => {
    const { clock, container, surface } = startedRestore()

    surface.snapshot.restore(300)
    container.grow(2000)
    clock.frame(16)

    expect(container.scrollTop).toBe(300)
  })

  it('abandons a watch in flight when the container detaches', () => {
    const clock = fakeTiming()
    const { frame, timing } = clock
    const surface = createScrollSurface(timing)
    const container = fakeContainer(900)
    const detach = surface.attach(container)

    surface.snapshot.restore(600)
    expect(clock.pending).toBe(true)

    detach()

    expect(clock.pending).toBe(false)

    container.grow(2000)
    frame(16)

    expect(container.scrollTop).toBe(100)
  })
})

/**
 * The forward half. Asserted per navigation kind rather than only on `push`, because the defect
 * this guards against is a kind that resets when it should not: a media-viewer page is a `replace`
 * and would yank the reader to the top of the screen behind the viewer.
 */
describe('onNavigation', () => {
  it('puts a pushed-to surface back at the top', () => {
    const surface = createScrollSurface()
    const container = fakeContainer()
    const detach = surface.attach(container)
    container.scrollTop = 500

    onNavigation('push')

    expect(container.scrollTop).toBe(0)
    detach()
  })

  // `replace` is deliberately absent: it resets or not by pathname, covered on its own below.
  it.each(['enter', 'popstate'] as const satisfies readonly NavigationKind[])(
    'leaves the offset alone on %s',
    (kind) => {
      const surface = createScrollSurface()
      const container = fakeContainer()
      const detach = surface.attach(container)
      container.scrollTop = 500

      onNavigation(kind)

      expect(container.scrollTop).toBe(500)
      detach()
    },
  )

  // Finding from review: `trail.exit` REPLACES to a different screen whenever it cannot pop, which
  // is every form submit and cancel. Reading replace as "same screen" left the destination wearing
  // the form's offset. Driven: cancelling `/routes/5413/edit` at 760 landed the detail page at 341.
  it('resets a replace that lands on a different screen', () => {
    const container = fakeContainer()
    const unregister = resetOnNavigate(container)
    container.scrollTop = 500

    onNavigation('replace', false)

    expect(container.scrollTop).toBe(0)
    unregister()
  })

  it('leaves a replace that stays on the same screen alone', () => {
    const container = fakeContainer()
    const unregister = resetOnNavigate(container)
    container.scrollTop = 500

    onNavigation('replace', true)

    expect(container.scrollTop).toBe(500)
    unregister()
  })

  // Finding from review: the reset zeroed the container but left an in-flight restore running, so
  // the watch's next frame dragged the new screen back to the previous one's offset.
  it('abandons an in-flight restore, so the watch cannot undo the reset', () => {
    const clock = fakeTiming()
    const surface = createScrollSurface(clock.timing)
    const container = fakeContainer(900)
    surface.attach(container)

    surface.snapshot.restore(600)
    expect(clock.pending, 'a restore is in flight').toBe(true)

    onNavigation('push')
    expect(container.scrollTop).toBe(0)

    // The content the restore was waiting for arrives after the push.
    container.grow(2000)
    clock.frame(16)

    expect(container.scrollTop, 'the new screen stays at the top').toBe(0)
  })

  // Same hazard on the other branch: a queued restore must not fire onto the screen after a push.
  it('drops a queued restore when a push lands first', () => {
    const surface = createScrollSurface()
    const container = fakeContainer()

    surface.snapshot.restore(420)
    onNavigation('push')
    surface.attach(container)

    expect(container.scrollTop).toBe(0)
  })

  it('resets a surface registered for the reset alone', () => {
    const container = fakeContainer()
    const unregister = resetOnNavigate(container)
    container.scrollTop = 500

    onNavigation('push')

    expect(container.scrollTop).toBe(0)
    unregister()
  })

  it('resets every live surface at once', () => {
    const first = fakeContainer()
    const second = fakeContainer()
    const detachFirst = resetOnNavigate(first)
    const detachSecond = resetOnNavigate(second)
    first.scrollTop = 500
    second.scrollTop = 300

    onNavigation('push')

    expect([first.scrollTop, second.scrollTop]).toEqual([0, 0])
    detachFirst()
    detachSecond()
  })

  // The layout path, not just `resetOnNavigate`'s: a detached `<main>` that stayed registered would
  // be written to on every later push.
  it('stops resetting a layout surface that has detached', () => {
    const surface = createScrollSurface()
    const container = fakeContainer()
    surface.attach(container)()
    container.scrollTop = 500

    onNavigation('push')

    expect(container.scrollTop).toBe(500)
  })

  it('stops resetting a surface that has gone away', () => {
    const container = fakeContainer()
    resetOnNavigate(container)()
    container.scrollTop = 500

    onNavigation('push')

    expect(container.scrollTop).toBe(500)
  })
})

/**
 * The media viewer's shape: `openMedia` PUSHES `?media=` so back closes it, so a rule keyed on the
 * navigation kind alone resets the screen behind the viewer and loses the reader's place when they
 * close it. Driving it caught this; the kind tests above cannot, since it is a genuine push.
 */
describe('a push that stays on the same screen', () => {
  it('leaves the offset alone', () => {
    const container = fakeContainer()
    const unregister = resetOnNavigate(container)
    container.scrollTop = 500

    onNavigation('push', true)

    expect(container.scrollTop).toBe(500)
    unregister()
  })

  it('still resets when the screen actually changes', () => {
    const container = fakeContainer()
    const unregister = resetOnNavigate(container)
    container.scrollTop = 500

    onNavigation('push', false)

    expect(container.scrollTop).toBe(0)
    unregister()
  })
})
