import { fingerprint } from '$lib/forms/fingerprint'

/** A block's pin, in the shape both sides of the comparison can see. */
export interface BlockPin {
  estimated: boolean
  lat: number
  long: number
}

/**
 * The pin a block form loaded, so a save proves what it replaces. Coordinates included, unlike the
 * topo one, because the submit replaces the whole pin. `null` is a value: it is the claim a delete
 * has to make.
 *
 * QUANTIZED because the two sides read different doubles: Zero carries the exact value, postgres.js
 * parses 15-digit text. Raw floats refused every save of a located block (346 of 350 on dev).
 */
export function blockPinFingerprint(pin: BlockPin | null | undefined): string {
  const canonical = JSON.stringify(pin == null ? null : [pin.lat.toFixed(7), pin.long.toFixed(7), pin.estimated])

  return `${pin == null ? 0 : 1}-${fingerprint(canonical)}`
}
