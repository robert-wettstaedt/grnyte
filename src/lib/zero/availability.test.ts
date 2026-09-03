import { describe, expect, it } from 'vitest'
import { resolveAvailability } from './resource.svelte'

/**
 * The truth table for the offline judgement.
 *
 * Every case here is a bug that shipped, which is the point: four of them were found by review after
 * the fact, in a function that could not be constructed and therefore could not be asserted.
 */

/** A field device, online, mid-first-load, with both preloads behind it. Each test bends one thing. */
const base = {
  fieldDevice: true,
  guidebookSynced: true,
  online: true,
  policy: undefined,
  referenceSynced: true,
  status: 'loading',
} as const

describe('resolveAvailability', () => {
  it('reports an answer whenever there is one', () => {
    expect(resolveAvailability({ ...base, status: 'ready' })).toBe('ready')
  })

  it('reports loading only while there is a server to finish the job', () => {
    expect(resolveAvailability({ ...base, online: true })).toBe('loading')
  })

  it('never reports loading offline, which is a spinner that cannot resolve', () => {
    expect(resolveAvailability({ ...base, online: false })).not.toBe('loading')
  })

  describe('excluded data', () => {
    it('is excluded offline even when rows are present', () => {
      // The one that mattered most. `status: 'ready'` means the replica holds rows, but for an
      // excluded query those arrived with somebody else's preload: a stranger's ascents ride along
      // with the routes you browsed. Reading that as an answer let a profile page present a fragment
      // of a person's logbook as their climbing.
      expect(resolveAvailability({ ...base, online: false, policy: 'excluded', status: 'ready' })).toBe('excluded')
    })

    it('is still just data when online', () => {
      expect(resolveAvailability({ ...base, policy: 'excluded', status: 'ready' })).toBe('ready')
    })
  })

  describe('preloaded data, offline and empty', () => {
    it('treats empty as an answer once the matching preload finished', () => {
      // Otherwise an area that genuinely has no routes tells a reader with a fully synced guidebook
      // to connect and download it: a sync problem stated over a fact about the crag.
      expect(resolveAvailability({ ...base, online: false, policy: 'field' })).toBe('ready')
      expect(resolveAvailability({ ...base, online: false, policy: 'always' })).toBe('ready')
    })

    it('does not, on a device that never finished that preload', () => {
      expect(resolveAvailability({ ...base, guidebookSynced: false, online: false, policy: 'field' })).toBe('unsynced')
      expect(resolveAvailability({ ...base, online: false, policy: 'always', referenceSynced: false })).toBe('unsynced')
    })

    it('does not claim the guidebook on the strength of the reference stamp', () => {
      // The two stamps are not interchangeable. The reference one lands on five tiny queries seconds
      // into a sync with thousands of rows still to come, so a connection lost in that gap (the
      // normal shape of a sync at a crag) left the device claiming a guidebook it half had.
      expect(
        resolveAvailability({ ...base, guidebookSynced: false, online: false, policy: 'field', referenceSynced: true }),
      ).toBe('unsynced')
    })

    it('does not claim the guidebook on a device that does not keep one', () => {
      expect(resolveAvailability({ ...base, fieldDevice: false, online: false, policy: 'field' })).toBe('unsynced')
    })
  })

  describe('unlisted queries', () => {
    it('are not downloaded rather than not existing', () => {
      // No policy means no promise either way, so offline and empty is honestly "not on this device".
      expect(resolveAvailability({ ...base, online: false })).toBe('unsynced')
    })
  })

  describe('errors', () => {
    it('are their own answer and never ready', () => {
      // Folding these into `ready` let a caller outside QueryState render "0" next to an error tile.
      expect(resolveAvailability({ ...base, status: 'error' })).toBe('error')
    })

    it('outrank every other input', () => {
      expect(resolveAvailability({ ...base, online: false, policy: 'excluded', status: 'error' })).toBe('error')
    })
  })
})
