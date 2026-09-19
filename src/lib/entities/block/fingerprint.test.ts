/** `blockPinFingerprint` lets the block form prove which pin it replaces. A block with no pin and
 *  one whose pin never loaded send the same empty fields; only this tells them apart. */
import { describe, expect, it } from 'vitest'
import { blockPinFingerprint } from './fingerprint'

const pin = (lat: number, long: number, estimated = false) => ({ estimated, lat, long })

describe('blockPinFingerprint', () => {
  it('is stable across two reads of the same pin', () => {
    expect(blockPinFingerprint(pin(47.1, 8.2))).toBe(blockPinFingerprint(pin(47.1, 8.2)))
  })

  it('tells "no pin" apart from a pin, which is the claim a delete has to make', () => {
    expect(blockPinFingerprint(null)).not.toBe(blockPinFingerprint(pin(47.1, 8.2)))
  })

  it('treats undefined as "no pin", since a never-loaded relation reads that way', () => {
    expect(blockPinFingerprint(undefined)).toBe(blockPinFingerprint(null))
  })

  it('changes when the pin moves', () => {
    expect(blockPinFingerprint(pin(47.1, 8.2))).not.toBe(blockPinFingerprint(pin(47.1, 8.3)))
    expect(blockPinFingerprint(pin(47.1, 8.2))).not.toBe(blockPinFingerprint(pin(47.2, 8.2)))
  })

  it('changes when only the estimated flag changes', () => {
    // Stored on the same row and rewritten by the same submit, so a save that carried a stale one
    // would silently turn somebody's measured pin back into a guess.
    expect(blockPinFingerprint(pin(47.1, 8.2, true))).not.toBe(blockPinFingerprint(pin(47.1, 8.2, false)))
  })

  it('does not confuse latitude with longitude', () => {
    expect(blockPinFingerprint(pin(47.1, 8.2))).not.toBe(blockPinFingerprint(pin(8.2, 47.1)))
  })

  it('leads with whether there was a pin at all', () => {
    expect(blockPinFingerprint(null)).toMatch(/^0-/)
    expect(blockPinFingerprint(pin(47.1, 8.2))).toMatch(/^1-/)
  })
})
