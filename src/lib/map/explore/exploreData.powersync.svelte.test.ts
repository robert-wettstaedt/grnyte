import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExploreMapData } from './exploreData.powersync.svelte'
import { parseRouteFilter } from './filter'
import type { OpenEntity } from './narrow'

const sync = $state({ confirmed: false, online: true, refused: false })
const reads: { enabled?: () => boolean }[] = []
const list = (opts?: { enabled?: () => boolean }) => {
  if (opts) reads.push(opts)
  return { data: [], phase: { kind: 'loading' } }
}

vi.mock('$lib/entities/block/resources.powersync.svelte', () => ({
  blockList: () => list(),
  blockMapList: (opts?: object) => list(opts),
}))
vi.mock('$lib/entities/area/resources.powersync.svelte', () => ({ areaMapList: (opts?: object) => list(opts) }))
vi.mock('$lib/entities/route/resources.powersync.svelte', () => ({
  routeMapList: (_: unknown, opts?: object) => list(opts),
}))
vi.mock('$lib/state/engine.powersync', () => ({ downloadRefused: () => sync.refused }))
vi.mock('$lib/powersync/db.svelte', () => ({
  powerSyncStatus: () => ({ dataFlowStatus: { downloadError: sync.refused ? new Error('refused') : undefined } }),
  streamConfirmed: () => sync.confirmed,
}))
vi.mock('$lib/state/online.svelte', () => ({ isOnline: () => sync.online }))
vi.mock('$lib/components/EntitySearch/search.svelte', () => ({ debouncedQuery: () => () => '' }))
vi.mock('$lib/state/pill.svelte', () => ({ quietly: <T>(make: () => T) => make() }))
vi.mock('./filteredRoutes.svelte', () => ({ filteredRouteList: <T>(routes: T) => routes }))

let stop = () => {}
// The map's blocks, areas and route counts: the first three lists it creates (the search's comes last).
const mapReads = (open: OpenEntity) => {
  reads.length = 0
  stop = $effect.root(() => {
    createExploreMapData(
      () => parseRouteFilter(new URLSearchParams()),
      () => undefined,
      () => '',
      () => open,
    )
  })
  flushSync()
  return () => reads.slice(0, 3).map((opts) => opts.enabled?.() ?? true)
}

describe('createExploreMapData read gate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.assign(sync, { confirmed: false, online: true, refused: false })
  })
  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('holds the map behind a sheet until the guidebook is taken in', () => {
    const enabled = mapReads({ id: 26, kind: 'areas' })
    expect(enabled()).toEqual([false, false, false])
    sync.confirmed = true
    flushSync()
    expect(enabled()).toEqual([true, true, true])
  })

  it('reads at once without a sheet', () => {
    expect(mapReads(null)()).toEqual([true, true, true])
  })

  it('reads at once offline or refused, and after 1.5 s at the latest', () => {
    sync.online = false
    expect(mapReads({ id: 49, kind: 'blocks' })()).toEqual([true, true, true])
    stop()
    sync.online = true
    sync.refused = true
    expect(mapReads({ id: 49, kind: 'blocks' })()).toEqual([true, true, true])
    stop()
    sync.refused = false
    const enabled = mapReads({ id: 49, kind: 'blocks' })
    vi.advanceTimersByTime(1500)
    flushSync()
    expect(enabled()).toEqual([true, true, true])
  })
})
