import { recordView, VIEWED_KEY } from '$lib/components/EntitySearch/recent.svelte'
import { dropAllDatabases } from '@rocicorp/zero'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadHistory, saveHistory } from './searchHistory'
import { markSynced, trackSyncFor } from './sync.svelte'
import { wipeDeviceData } from './wipe'

vi.mock('@rocicorp/zero', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@rocicorp/zero')>()),
  dropAllDatabases: vi.fn(async () => ({ dropped: [], errors: [] })),
}))

describe('wipeDeviceData', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(dropAllDatabases).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('drops the replica, the image cache, the sync stamps and the search history', async () => {
    const del = vi.fn(async () => true)
    vi.stubGlobal('caches', { delete: del })
    trackSyncFor('u1')
    markSynced('reference')
    saveHistory(['sun'])
    recordView({ id: 69, type: 'blocks' })

    await wipeDeviceData()

    expect(dropAllDatabases).toHaveBeenCalledOnce()
    expect(del).toHaveBeenCalledWith('images')
    expect(localStorage.getItem(VIEWED_KEY)).toBeNull()
    expect(loadHistory()).toEqual([])
    expect(
      Object.keys(localStorage).filter((name) => name.includes('SyncedAt') || name.includes('lastSyncedAt')),
    ).toEqual([])
  })

  it('still wipes the rest when a step fails or Cache Storage is missing', async () => {
    vi.stubGlobal('caches', undefined)
    vi.mocked(dropAllDatabases).mockRejectedValueOnce(new Error('idb blocked'))
    saveHistory(['sun'])

    await expect(wipeDeviceData()).resolves.toBeUndefined()
    expect(loadHistory()).toEqual([])
  })
})
