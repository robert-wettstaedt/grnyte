import { describe, expect, it } from 'vitest'
import { resolveKept } from './resource.svelte'

/**
 * Whether this device holds a query's whole answer offline. It feeds the settled latch, so it is
 * what lets an empty offline result count as an answer. Every case here is a bug that shipped.
 */

/** A field device with every preload behind it. Each test bends one thing. */
const base = {
  fieldDevice: true,
  guidebookSynced: true,
  personalSynced: true,
  policy: 'field',
  referenceSynced: true,
  storeLoaded: true,
} as const

describe('resolveKept', () => {
  it('keeps once the matching preload finished', () => {
    // Otherwise an area that genuinely has no routes tells a reader with a fully synced guidebook
    // to connect and download it: a sync problem stated over a fact about the guidebook.
    expect(resolveKept(base)).toBe(true)
    expect(resolveKept({ ...base, policy: 'always' })).toBe(true)
  })

  it('does not, on a device that never finished that preload', () => {
    expect(resolveKept({ ...base, guidebookSynced: false })).toBe(false)
    expect(resolveKept({ ...base, policy: 'always', referenceSynced: false })).toBe(false)
  })

  it('does not claim the guidebook on the strength of the reference stamp', () => {
    // The reference stamp lands on five tiny queries seconds into a sync with thousands of rows
    // still to come, so a connection lost in that gap left the device claiming a half guidebook.
    expect(resolveKept({ ...base, guidebookSynced: false, referenceSynced: true })).toBe(false)
  })

  it('does not claim the guidebook on a device that does not keep one', () => {
    expect(resolveKept({ ...base, fieldDevice: false })).toBe(false)
  })

  it('claims nothing until the replica is read back, since its stamps outlive it', () => {
    expect(resolveKept({ ...base, policy: 'always', storeLoaded: false })).toBe(false)
    expect(resolveKept({ ...base, storeLoaded: false })).toBe(false)
  })

  it('vouches for the personal stage by its own stamp, not the guidebook one', () => {
    expect(resolveKept({ ...base, policy: 'personal' })).toBe(true)
    expect(resolveKept({ ...base, personalSynced: false, policy: 'personal' })).toBe(false)
  })

  it('keeps nothing for an unlisted or excluded query', () => {
    // No policy is no promise either way; excluded is a promise not to keep it.
    expect(resolveKept({ ...base, policy: undefined })).toBe(false)
    expect(resolveKept({ ...base, policy: 'excluded' })).toBe(false)
  })
})
