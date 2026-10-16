import { flushSync, untrack } from 'svelte'
import { describe, expect, it } from 'vitest'
import { holdsPill, PillSurface, quietly } from './pill.svelte'

const merge = { icon: 'arrow-up-down', kind: 'action', label: '3 new', onclick: () => {} } as const

describe('a pill surface', () => {
  it('shows nothing with no holder and no offer', () => {
    expect(new PillSurface().content).toBeUndefined()
  })

  it('syncs while held, and stops once released', () => {
    const pill = new PillSurface()
    const release = pill.hold({})
    expect(pill.content).toEqual({ kind: 'syncing' })
    release()
    expect(pill.content).toBeUndefined()
  })

  it('ranks an action over a status over syncing', () => {
    const pill = new PillSurface()
    pill.hold({})
    const withdrawStatus = pill.offer(() => ({ kind: 'status', label: 'Loading map' }))
    expect(pill.content).toEqual({ kind: 'status', label: 'Loading map' })

    const withdrawAction = pill.offer(() => merge)
    expect(pill.content).toBe(merge)

    withdrawAction()
    withdrawStatus()
    expect(pill.content).toEqual({ kind: 'syncing' })
  })

  it('ranks a status over a dismissible state over syncing', () => {
    const pill = new PillSurface()
    pill.hold({})
    const search = {
      announcement: 'Egg',
      dismissLabel: 'Clear',
      icon: 'search',
      kind: 'dismiss',
      label: 'Egg',
      ondismiss: () => {},
    } as const
    pill.offer(() => search)
    expect(pill.content).toBe(search)
    const withdrawStatus = pill.offer(() => ({ kind: 'status', label: 'Loading map' }))
    expect(pill.content).toEqual({ kind: 'status', label: 'Loading map' })
    withdrawStatus()
    expect(pill.content).toBe(search)
  })

  it('skips an offer that currently has nothing to say', () => {
    const pill = new PillSurface()
    pill.offer(() => undefined)
    expect(pill.content).toBeUndefined()
  })

  it('keeps one surface out of another', () => {
    const sheet = new PillSurface()
    const screen = new PillSurface()
    sheet.hold({})
    expect(screen.content).toBeUndefined()
  })

  it('lets nothing built quietly hold a pill', () => {
    expect(holdsPill()).toBe(true)
    expect(quietly(() => holdsPill())).toBe(false)
    expect(holdsPill()).toBe(true)
  })

  it('hangs from the latest page header, falling back as each releases', () => {
    const pill = new PillSurface()
    expect(pill.anchorBottom).toBeUndefined()
    const releaseFirst = pill.anchor(() => 60)
    const releaseSecond = pill.anchor(() => 80)
    expect(pill.anchorBottom).toBe(80)
    releaseFirst()
    expect(pill.anchorBottom).toBe(80)
    releaseSecond()
    expect(pill.anchorBottom).toBeUndefined()
  })

  it('moves the pill as a header mounts, grows and releases, read from an effect', () => {
    const pill = new PillSurface()
    let height = $state(60)
    const seen: (number | undefined)[] = []
    const cleanup = $effect.root(() => {
      $effect(() => {
        seen.push(pill.anchorBottom)
      })
    })
    flushSync()
    const release = untrack(() => pill.anchor(() => height))
    flushSync()
    height = 90
    flushSync()
    release()
    flushSync()
    cleanup()
    expect(seen).toEqual([undefined, 60, 90, undefined])
  })

  it('treats a hidden header (zero high) as no anchor', () => {
    const pill = new PillSurface()
    pill.anchor(() => 0)
    expect(pill.anchorBottom).toBeUndefined()
  })
})
