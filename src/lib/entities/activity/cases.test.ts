import { m } from '$lib/paraglide/messages'
import { describe, expect, it } from 'vitest'
import type { ActivityCardView } from './card'
import { CASES, ME, world } from './cases'
import type { ActivityTopoLine } from './change'
import { activityEntityKey } from './entity'
import { groups, view } from './fixture'

/**
 * The protocol case list, in two jobs.
 *
 * First, its own invariants, so the catalogue story cannot quietly start showing a state the app
 * cannot produce. Each of those was a real fixture bug that read as a product bug on the wall.
 *
 * Then the snapshot: all 256 cases through the real `groupActivities` and `activityCard`, which
 * is the regression net the file was written for. It guards grouping, the verb catalogue, the
 * card view and the change lines in one assertion, at the interface the app itself calls.
 */

/**
 * A case's cards, with the clock taken out.
 *
 * The fixtures date against wall-clock time so the story wall reads like a week (see
 * `fixture.ts`), which makes the absolute stamps worthless to a snapshot and would churn the
 * file on every run. What is kept is every decision: the keys, the params, the row states, the
 * change kinds and their decoded values. `climbedAt` survives as a flag, because whether a card
 * mentions the climb date is a decision while the date itself is not.
 */
function decided(entry: (typeof CASES)[number]) {
  return groups(entry.activities).map((group) => {
    const card: ActivityCardView = view(group, entry.entities ?? world, ME, entry.topos)

    // Spread rather than listed field by field, so a field added to the card view lands in the
    // snapshot on its own and has to be looked at.
    return {
      ...without(card, 'changes', 'climbedAt', 'createdAt', 'files', 'rows'),
      backdated: card.climbedAt != null,
      changes: card.changes.map((change) => ({
        ...without(change, 'field', 'id'),
        label: change.field.labelKey,
        ...(change.kind === 'topo' ? { lines: change.lines.map(drawn) } : {}),
      })),
      files: card.files.map((file) => file.id),
      kind: group.kind,
      rows: card.rows.map((row) => ({ name: row.name, ref: row.ref, row: row.entity?.row, state: row.state })),
    }
  })
}

/**
 * One topo line without its points' ids.
 *
 * `convertPathToPoints` mints a fresh uuid per point every time it decodes a path, so those ids
 * are an artefact of the decode rather than anything the card decided. The geometry beside them
 * is the decision, and it stays.
 */
function drawn(line: ActivityTopoLine) {
  return { ...line, points: line.points.map((point) => without(point, 'id')) }
}

function without<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...value }
  for (const key of keys) {
    delete copy[key]
  }
  return copy
}

describe('activity case fixtures', () => {
  it('holds one entry per protocol id', () => {
    expect(CASES).toHaveLength(256)
    expect(new Set(CASES.map((entry) => entry.id)).size).toBe(CASES.length)
  })

  // Hydration after a delete answers with null. A fixture that leaves the entity alive renders a
  // live route row with its grade and stars under "You deleted it".
  it('hydrates a tombstone for every whole-entity delete', () => {
    const deletes = CASES.filter((entry) =>
      entry.activities.some((activity) => activity.type === 'deleted' && activity.columnName == null),
    )

    expect(deletes.length).toBeGreaterThan(0)

    for (const entry of deletes) {
      for (const activity of entry.activities) {
        if (activity.type !== 'deleted' || activity.columnName != null) {
          continue
        }

        const key = activityEntityKey({ id: activity.entityId, type: activity.entityType })
        expect({ case: entry.id, entity: (entry.entities ?? world).get(key) }).toEqual({
          case: entry.id,
          entity: null,
        })
      }
    }
  })

  // `toRouteListItem` swaps a blank name for the placeholder before the feed ever sees the route,
  // so a fixture passing `''` is testing a shape hydration cannot hand out.
  it('never hydrates a route with a blank name', () => {
    for (const entry of CASES) {
      for (const value of (entry.entities ?? world).values()) {
        if (value?.row !== 'route') {
          continue
        }

        expect({ case: entry.id, name: value.name }).not.toEqual({ case: entry.id, name: '' })
        expect({ case: entry.id, name: value.route?.name }).not.toEqual({ case: entry.id, name: '' })
      }
    }
  })

  it('carries the mapped placeholder on the nameless route cases', () => {
    for (const id of ['ROUTE-01b', 'ROUTE-01f', 'ROUTE-02b']) {
      const entry = CASES.find((entry) => entry.id === id)
      const named = [...(entry?.entities ?? world).values()].filter((value) => value?.name === m.common_unnamed())

      expect({ count: named.length, id }).toEqual({ count: 1, id })
    }
  })
})

describe('every protocol case', () => {
  /**
   * One snapshot for the whole matrix.
   *
   * Per case rather than one giant object, so a diff names the ids that moved: `AREA-05b` in the
   * report is the case in the protocol and the anchor in the catalogue story.
   */
  it.each(CASES.map((entry) => [entry.id, entry] as const))('decides the same card for %s', (id, entry) => {
    expect(decided(entry)).toMatchSnapshot(id)
  })
})
