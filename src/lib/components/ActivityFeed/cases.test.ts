/**
 * Invariants of the protocol case list, so the catalogue story cannot quietly start showing a
 * state the app cannot produce. Each of these was a real fixture bug that read as a product bug
 * on the wall.
 */
import { activityEntityKey } from '$lib/entities/activity/entity'
import { m } from '$lib/paraglide/messages'
import { describe, expect, it } from 'vitest'
import { CASES, world } from './cases'

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
