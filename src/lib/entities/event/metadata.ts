import { parseTopoChange, type TopoChange } from '$lib/entities/topo/change'
import { parseCoords, type StoredCoords } from '$lib/map/coords'

/**
 * Whose ascent a deletion took, as its row recorded it.
 *
 * An ascent is hard-deleted, and the event row is written in the same transaction, so by the
 * time any reader sees the card there is nothing left to ask who climbed it. Without this the
 * card can only say "removed an ascent of Rampe", which is the one thing a maintainer clearing
 * up somebody else's log must not say. Same reasoning as the name an area delete stashes in
 * `oldValue`: write down what is about to stop being knowable.
 *
 * The name travels with the id because the id alone would need a user lookup the feed does not
 * otherwise do for a row whose subject is gone.
 */
export interface DeletedAscentClimber {
  climberFk: number
  climberName: string
}

/**
 * What a whole-entity deletion took with it, as its row stores it.
 *
 * A deletion is the one card whose subject a reader cannot go and look at, so the scale of it
 * has to be written down while it is still knowable. Counts only: the card says "12 blocks,
 * 200 routes", never a list, because a list of things that no longer exist is not navigable.
 *
 * Rows written before this carry no metadata and render exactly as they always did.
 */
export interface DeletionScale {
  areas?: number
  blocks?: number
  routes?: number
}

/** What `events.metadata` holds, decoded once: each writer picked its own encoding of one text column. */
export type EventMetadata =
  | { change: TopoChange; kind: 'topo' }
  | { climber: DeletedAscentClimber; kind: 'deletedAscent' }
  | { coords: StoredCoords; kind: 'coords' }
  | { kind: 'deletionScale'; scale: DeletionScale }
  | { kind: 'none' }
  | { kind: 'text' }

/** The first encoding the raw string satisfies. Free text (a first ascensionist's name) could match
 *  two shapes, so readers keep their objectType and verb gates. */
export function decodeMetadata(raw: string | undefined): EventMetadata {
  if (raw == null || raw.length === 0) return { kind: 'none' }

  const coords = parseCoords(raw)
  if (coords != null) return { coords, kind: 'coords' }
  const change = parseTopoChange(raw)
  if (change != null) return { change, kind: 'topo' }
  const climber = parseDeletedAscent(raw)
  if (climber != null) return { climber, kind: 'deletedAscent' }
  const scale = parseDeletionScale(raw)
  if (scale != null) return { kind: 'deletionScale', scale }

  return { kind: 'text' }
}

export function parseDeletedAscent(raw: string | undefined): DeletedAscentClimber | undefined {
  const { climberFk, climberName } = parseJsonObject(raw) ?? {}
  return typeof climberFk === 'number' && Number.isFinite(climberFk) && typeof climberName === 'string'
    ? { climberFk, climberName }
    : undefined
}

export function parseDeletionScale(raw: string | undefined): DeletionScale | undefined {
  const parsed = parseJsonObject(raw)
  if (parsed == null) return undefined

  // Checked rather than cast: the card adds these up, and `+=` on a JSON string concatenates.
  const counted = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
  const scale: DeletionScale = {
    areas: counted(parsed.areas),
    blocks: counted(parsed.blocks),
    routes: counted(parsed.routes),
  }
  return scale.areas == null && scale.blocks == null && scale.routes == null ? undefined : scale
}

export function stringifyDeletedAscent(climber: DeletedAscentClimber): string {
  return JSON.stringify(climber)
}

/** Only the non-zero counts, so an empty sector stores nothing rather than a row of zeroes. */
export function stringifyDeletionScale(scale: DeletionScale): string | undefined {
  const entries = Object.entries(scale).filter(([, value]) => typeof value === 'number' && value > 0)
  return entries.length === 0 ? undefined : JSON.stringify(Object.fromEntries(entries))
}

function parseJsonObject(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw == null || raw.length === 0) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed != null ? (parsed as Record<string, unknown>) : undefined
  } catch {
    // Coordinates and plain text share the column and are not JSON.
    return undefined
  }
}
