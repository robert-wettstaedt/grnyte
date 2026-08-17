import { describe, expect, it } from 'vitest'
import { eventCard } from './card'
import { event } from './fixture'
import { groupEvents } from './grouping'
import type { EventListItem } from './mapper'

/**
 * The card built from events says what the card built from activity rows said.
 *
 * `activityCard` still does the deciding, so these do not re-test its rules; they test the two
 * things the adapter is responsible for. That the group it hands over expands to the rows the old
 * table stored, and that the entity map it builds puts each entity where the card looks for it.
 * Get either wrong and the card renders a generic sentence with an unnamed slot, which no type
 * error would catch.
 */
const routeEntity = { crumbs: [], href: '/routes/1', name: 'Traumtanz', row: 'route' as const }

const card = (events: EventListItem[]) => eventCard(groupEvents(events)[0], 1)

describe('eventCard', () => {
  it('names the entity the event carried, with no fetch in between', () => {
    const view = card([event({ entity: routeEntity, objectId: 1, objectType: 'route', verb: 'create' })])

    expect(view.entityName).toBe('Traumtanz')
    expect(view.entityUnnamed).toBe(false)
    expect(view.rows[0]?.state).toBe('entity')
  })

  it('expands an update into one row per changed column, as the old table stored them', () => {
    const view = card([
      event({
        changes: [
          { columnName: 'name', newValue: 'B', objectId: undefined, objectType: undefined, oldValue: 'A' },
          { columnName: 'description', newValue: 'y', objectId: undefined, objectType: undefined, oldValue: 'x' },
        ],
        entity: routeEntity,
        objectId: 1,
        objectType: 'route',
        verb: 'update',
      }),
    ])

    // Two change lines in the expanded half, from one event.
    expect(view.changes).toHaveLength(2)
  })

  it('never reports a row as still syncing, because nothing syncs after the fact', () => {
    const view = card([event({ entity: undefined, objectId: 'f1', objectType: 'file', verb: 'add' })])

    expect(view.rows.every((row) => row.state !== 'skeleton')).toBe(true)
  })

  it('says a missing name is missing for good rather than pulsing', () => {
    const view = card([event({ entity: undefined, objectId: 'f1', objectType: 'file', verb: 'add' })])

    expect(view.entityName).toBeUndefined()
    expect(view.entityUnnamed).toBe(true)
  })

  it('puts every event bar on the row that event named, not one bar on the card', () => {
    const noon = new Date(2026, 0, 1, 12).getTime()
    const parent = { id: 7, type: 'block' as const }
    const ascent = (id: number, routeId: number, at: number) =>
      event({
        actorFk: 2,
        createdAt: at,
        entity: { ...routeEntity, href: `/routes/${routeId}`, name: `Route ${routeId}` },
        id,
        objectId: id,
        objectType: 'ascent',
        parent,
        reactions: id === 10 ? [{ emoji: '💪', userFk: 1, userName: 'ada' }] : [],
        verb: 'create',
      })

    const view = card([ascent(10, 1, noon), ascent(11, 2, noon - 60_000)])

    expect(view.rows.map((row) => row.bar?.eventId)).toEqual([10, 11])
    // The 💪 sits on the ascent it was sent to, and the sibling row is empty.
    expect(view.rows[0].bar?.chips).toEqual([{ count: 1, emoji: '💪', mine: true, names: ['ada'] }])
    expect(view.rows[1].bar?.chips).toEqual([])
    // Nothing left over: every event has a row of its own to hang under.
    expect(view.bars).toEqual([])
  })

  it('reads a card-level bar for a card holding one event', () => {
    // The entity's own page drops the row that would link back to it, so the only bar there is has
    // nowhere to ride and belongs to the card.
    const view = eventCard(
      groupEvents([event({ actorFk: 2, entity: routeEntity, objectId: 1, objectType: 'route', verb: 'create' })])[0],
      1,
      undefined,
      { id: '1', type: 'route' },
    )

    expect(view.rows).toHaveLength(0)
    expect(view.bars?.map((bar) => bar.eventId)).toEqual([1])
  })

  it('offers no add button on your own event', () => {
    const view = card([event({ actorFk: 1, entity: routeEntity, objectId: 1, objectType: 'route', verb: 'create' })])

    expect(view.rows[0].bar?.readonly).toBe(true)
  })

  it('keeps a reaction visible when its event lost its row to a sibling', () => {
    // Two events about the same route in one card: they share the single row, so only the newer
    // one's bar rides it. A chip on the older one still has to be somewhere a reader can take it
    // back, which is what the footer bars are for.
    const noon = new Date(2026, 0, 1, 12).getTime()
    const edit = (id: number, at: number, reactions: { emoji: string; userFk: number; userName: string }[]) =>
      event({ actorFk: 2, createdAt: at, entity: routeEntity, id, objectId: 1, objectType: 'route', reactions })

    const view = card([edit(21, noon, []), edit(20, noon - 60_000, [{ emoji: '🔥', userFk: 3, userName: 'mara' }])])

    expect(view.rows).toHaveLength(1)
    expect(view.bars?.map((bar) => bar.eventId)).toEqual([20])
  })

  it('names the place off the parent alone, with no event about it on the card', () => {
    // The common burst: two edits under one block, and nothing on the card is about the block. It
    // is named off `parentEntity`, which the mapper reads off the relation the row already carried.
    // Without it the headline drops to one of the two routes, which is the wrong sentence rather
    // than a missing word.
    const parent = { id: 7, type: 'block' as const }
    const parentEntity = { crumbs: [], href: '/blocks/7', name: 'Nordblock', row: 'block' as const }
    const noon = new Date(2026, 0, 1, 12).getTime()

    const view = card([
      event({ createdAt: noon, entity: routeEntity, id: 2, objectId: 1, objectType: 'route', parent, parentEntity }),
      event({
        createdAt: noon - 60_000,
        entity: { ...routeEntity, name: 'Kante' },
        id: 1,
        objectId: 2,
        objectType: 'route',
        parent,
        parentEntity,
      }),
    ])

    expect(view.entityName).toBe('Nordblock')
  })

  it('lets a burst headline name the place none of its events is about', () => {
    const parent = { id: 7, type: 'block' as const }
    const blockEntity = { crumbs: [], href: '/blocks/7', name: 'Nordblock', row: 'block' as const }
    const noon = new Date(2026, 0, 1, 12).getTime()

    const view = card([
      event({ createdAt: noon, entity: routeEntity, id: 2, objectId: 1, objectType: 'route', parent }),
      event({
        createdAt: noon - 60_000,
        entity: { ...routeEntity, name: 'Kante' },
        id: 1,
        objectId: 2,
        objectType: 'route',
        parent,
      }),
      // The block itself, so the map has an entity under its key: the headline names the place
      // and none of the edits above is about it.
      event({ createdAt: noon - 120_000, entity: blockEntity, id: 3, objectId: 7, objectType: 'block', parent }),
    ])

    expect(view.entityName).toBe('Nordblock')
  })
})
