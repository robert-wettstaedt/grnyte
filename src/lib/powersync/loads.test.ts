import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'grnyte:pageLoads'

// A fresh module per test stands in for a fresh document.
const load = () => import('./loads')

beforeEach(() => vi.resetModules())

afterEach(() => {
  localStorage.removeItem(KEY)
  vi.restoreAllMocks()
})

describe('page load counter', () => {
  it('counts a document once however often the layout load runs, even if timeOrigin wobbles', async () => {
    const { pageLoads, recordPageLoad } = await load()
    const origin = vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(1000)
    recordPageLoad()
    origin.mockReturnValue(1001)
    recordPageLoad()
    expect(pageLoads()).toEqual([1000])
  })

  it('adds a new document after the ones before it and keeps the last 50', async () => {
    localStorage.setItem(KEY, JSON.stringify(Array.from({ length: 50 }, (_, i) => i + 1)))
    const { pageLoads, recordPageLoad } = await load()
    vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(1000)
    recordPageLoad()
    const loads = pageLoads()
    expect(loads).toHaveLength(50)
    expect(loads[0]).toBe(2)
    expect(loads.at(-1)).toBe(1000)
  })

  it('reads corrupt storage as no loads', async () => {
    localStorage.setItem(KEY, '{nope')
    const { pageLoads } = await load()
    expect(pageLoads()).toEqual([])
  })
})
