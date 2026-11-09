import { afterEach, describe, expect, it, vi } from 'vitest'
import { pageLoads, recordPageLoad } from './loads'

const KEY = 'grnyte:pageLoads'

afterEach(() => {
  localStorage.removeItem(KEY)
  vi.restoreAllMocks()
})

describe('page load counter', () => {
  it('counts a document once however often the layout load runs', () => {
    recordPageLoad()
    recordPageLoad()
    expect(pageLoads()).toEqual([Math.round(performance.timeOrigin)])
  })

  it('adds a new document after the ones before it and keeps the last 50', () => {
    localStorage.setItem(KEY, JSON.stringify(Array.from({ length: 50 }, (_, i) => i + 1)))
    vi.spyOn(performance, 'timeOrigin', 'get').mockReturnValue(1000)
    recordPageLoad()
    const loads = pageLoads()
    expect(loads).toHaveLength(50)
    expect(loads[0]).toBe(2)
    expect(loads.at(-1)).toBe(1000)
  })

  it('reads corrupt storage as no loads', () => {
    localStorage.setItem(KEY, '{nope')
    expect(pageLoads()).toEqual([])
  })
})
