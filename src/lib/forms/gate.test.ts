import { describe, expect, it } from 'vitest'
import { resolveFormGate, type FormWait } from './gate'

/** A row on screen and confirmed whole. Each test bends one thing. */
const row = { availability: 'ready', isEmpty: false, settled: true, status: 'ready' } as const
const wait = (resource: Partial<FormWait['resource']> = {}, whole = false): FormWait => ({
  notFound: 'Route not found',
  resource: { ...row, ...resource },
  whole,
})
const online = { denied: false, online: true }

describe('resolveFormGate', () => {
  it('opens once every row is here', () => {
    expect(resolveFormGate([wait(), wait()], online)).toEqual({ kind: 'open' })
  })

  it('opens with nothing to wait for, so a form without rows renders as it always did', () => {
    expect(resolveFormGate([], online)).toEqual({ kind: 'open' })
  })

  it('shows one skeleton while any row loads', () => {
    expect(resolveFormGate([wait(), wait({ status: 'loading' })], online)).toEqual({ kind: 'loading' })
  })

  it('judges waits in order, so a row keyed off a loading one is not called missing', () => {
    // The block query runs on id -1 until the route lands, and confirms that empty.
    const gate = resolveFormGate(
      [wait({ status: 'loading' }), { ...wait({ isEmpty: true }), notFound: 'Block' }],
      online,
    )
    expect(gate).toEqual({ kind: 'loading' })
  })

  it('names the missing row by its own not-found title', () => {
    const gate = resolveFormGate([wait(), { ...wait({ isEmpty: true }), notFound: 'Block not found' }], online)
    expect(gate).toEqual({ kind: 'notFound', title: 'Block not found' })
  })

  it('reports an error over a skeleton that would never resolve', () => {
    expect(resolveFormGate([wait({ status: 'error' })], online)).toEqual({ kind: 'error' })
  })

  it('says offline when the row was never synced to this device', () => {
    const gate = resolveFormGate([wait({ availability: 'unsynced', settled: false, status: 'loading' })], online)
    expect(gate).toEqual({ excluded: false, kind: 'offline' })
  })

  it('says the data is not kept offline when the policy excludes it', () => {
    const gate = resolveFormGate([wait({ availability: 'excluded', settled: false })], online)
    expect(gate).toEqual({ excluded: true, kind: 'offline' })
  })

  it('refuses a reader without permission once the row is known', () => {
    expect(resolveFormGate([wait()], { denied: true, online: true })).toEqual({ kind: 'denied' })
  })

  it('refuses before waiting for the related rows, which permission does not need', () => {
    expect(resolveFormGate([wait({ settled: false }, true)], { denied: true, online: true })).toEqual({
      kind: 'denied',
    })
  })

  it('keeps the skeleton until a whole wait settles, so the seed reads every list', () => {
    expect(resolveFormGate([wait({ settled: false }, true)], online)).toEqual({ kind: 'loading' })
  })

  it('opens on an unsettled row when the form does not replace its lists', () => {
    expect(resolveFormGate([wait({ settled: false })], online)).toEqual({ kind: 'open' })
  })

  it('says offline rather than loading forever when the lists are not coming', () => {
    const gate = resolveFormGate([wait({ settled: false }, true)], { denied: false, online: false })
    expect(gate).toEqual({ excluded: false, kind: 'offline' })
  })
})
