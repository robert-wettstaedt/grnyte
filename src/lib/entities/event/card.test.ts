import { describe, expect, it } from 'vitest'
import { eventCard } from './card'
import { event } from './fixture'
import { groupEvents } from './grouping'
import type { EventListItem } from './mapper'

/**
 * The card built from events says what the card built from activity rows said.
 *
 * `cardView` still does the deciding, so these do not re-test its rules; they test the two
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

  it('reports a row with no entity as gone, because nothing syncs after the fact', () => {
    const view = card([event({ entity: undefined, objectId: 'f1', objectType: 'file', verb: 'add' })])

    expect(view.rows.every((row) => row.state === 'tombstone')).toBe(true)
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

  it('offers no reaction on your own event, but still a way into its thread', () => {
    // Nobody applauds their own event, so the bar is read-only there. It is still a bar: the
    // comment button is the way into a thread under a card that is about you, which is the most
    // likely reason to have something to say in one.
    const own = card([event({ actorFk: 1, entity: routeEntity, objectId: 1, objectType: 'route', verb: 'create' })])

    expect(own.rows[0].bar?.readonly).toBe(true)
    expect(own.rows[0].bar?.chips).toEqual([])

    // With a reaction on it, the chips are there to read and the bar still offers nothing to add.
    const reacted = card([
      event({
        actorFk: 1,
        entity: routeEntity,
        objectId: 1,
        objectType: 'route',
        reactions: [{ emoji: '🔥', userFk: 3, userName: 'mara' }],
        verb: 'create',
      }),
    ])

    expect(reacted.rows[0].bar?.readonly).toBe(true)
    expect(reacted.rows[0].bar?.chips).toHaveLength(1)
  })

  it('hangs a row bar on the oldest event about that entity, not the newest', () => {
    // Log an ascent and correct it a minute later: one card, one row, two events. The reader means
    // the send, so the bar under the row is the create. Taking the newest instead would also move
    // an existing bar every time somebody edited the thing again.
    const noon = new Date(2026, 0, 1, 12).getTime()
    const edit = (id: number, at: number, reactions: { emoji: string; userFk: number; userName: string }[]) =>
      event({ actorFk: 2, createdAt: at, entity: routeEntity, id, objectId: 1, objectType: 'route', reactions })

    const view = card([edit(21, noon, []), edit(20, noon - 60_000, [{ emoji: '🔥', userFk: 3, userName: 'mara' }])])

    expect(view.rows).toHaveLength(1)
    expect(view.rows[0].bar?.eventId).toBe(20)
    expect(view.rows[0].bar?.chips).toHaveLength(1)
    // The other event has no row and nothing on it, so it draws nothing.
    expect(view.bars).toEqual([])
  })

  it('keeps a reaction visible when its event has no row of its own', () => {
    // Three events about one entity share the single row. Whichever two miss out still have to put
    // a chip somewhere a reader can see it and take it back.
    const noon = new Date(2026, 0, 1, 12).getTime()
    const edit = (id: number, at: number, reactions: { emoji: string; userFk: number; userName: string }[]) =>
      event({ actorFk: 2, createdAt: at, entity: routeEntity, id, objectId: 1, objectType: 'route', reactions })

    const view = card([
      edit(22, noon, []),
      edit(21, noon - 60_000, [{ emoji: '🔥', userFk: 3, userName: 'mara' }]),
      edit(20, noon - 120_000, []),
    ])

    expect(view.rows[0].bar?.eventId).toBe(20)
    expect(view.bars?.map((bar) => bar.eventId)).toEqual([21])
  })

  it('gives a card with no rows one bar rather than none', () => {
    // The entity's own page drops the row that would link back to it. Without a bar in the footer
    // nothing on that page could be reacted to at all.
    const noon = new Date(2026, 0, 1, 12).getTime()
    const edit = (id: number, at: number) =>
      event({ actorFk: 2, createdAt: at, entity: routeEntity, id, objectId: 1, objectType: 'route' })

    const view = eventCard(groupEvents([edit(21, noon), edit(20, noon - 60_000)])[0], 1, undefined, {
      id: '1',
      type: 'route',
    })

    expect(view.rows).toHaveLength(0)
    expect(view.bars).toHaveLength(1)
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

/**
 * Which cards a mixed feed is allowed to draw quietly.
 *
 * The rule is deliberately narrow, and the cases that matter are the ones that LOOK like edits
 * and are not: a deletion is the thing a reader must not have to expand a row to notice, and a
 * role change is a permission grant. Get either wrong and the feed buries the two events that
 * exist to be seen.
 */
describe('eventCard tier', () => {
  const mixed = (events: EventListItem[]) => eventCard(groupEvents(events)[0], 1, undefined, undefined, 'mixed')

  it('draws a field edit on a place quietly', () => {
    expect(mixed([event({ objectType: 'route', verb: 'update' })]).tier).toBe('compact')
    expect(mixed([event({ objectId: 7, objectType: 'block', verb: 'update' })]).tier).toBe('compact')
    expect(mixed([event({ objectId: 3, objectType: 'area', verb: 'update' })]).tier).toBe('compact')
  })

  it('never draws a deletion quietly', () => {
    expect(mixed([event({ objectType: 'route', verb: 'delete' })]).tier).toBe('standard')
  })

  it('never draws a role change quietly', () => {
    expect(mixed([event({ objectId: 5, objectType: 'user', verb: 'update' })]).tier).toBe('standard')
  })

  it('never draws an ascent or its correction quietly', () => {
    expect(mixed([event({ objectId: 9, objectType: 'ascent', verb: 'create' })]).tier).toBe('standard')
    expect(mixed([event({ objectId: 9, objectType: 'ascent', verb: 'update' })]).tier).toBe('standard')
  })

  it('keeps a card standard when any one of its events is not a field edit', () => {
    const noon = new Date(2026, 0, 1, 12).getTime()
    const parent = { id: 7, type: 'block' as const }

    // A create and a rename under one block are one burst card, which is the case that actually
    // mixes: a group is one thing a reader acts on, so a card that also added a route is a card
    // about adding a route. (A deletion could not test this. It keys as `removal`, so it is
    // already a card of its own before a tier is asked for.)
    const [group, ...rest] = groupEvents([
      event({ createdAt: noon, id: 2, objectId: 1, objectType: 'route', parent, verb: 'create' }),
      event({ createdAt: noon - 60_000, id: 1, objectId: 2, objectType: 'route', parent, verb: 'update' }),
    ])

    expect(rest).toHaveLength(0)
    expect(group.events).toHaveLength(2)
    expect(eventCard(group, 1, undefined, undefined, 'mixed').tier).toBe('standard')
  })

  it('leaves every card standard on a surface that is about edits', () => {
    const view = eventCard(groupEvents([event({ objectType: 'route', verb: 'update' })])[0], 1)

    expect(view.tier).toBe('standard')
  })
})

/**
 * The one claim a card is allowed to make.
 *
 * The card does not decide WHETHER an ascent earned one (`deriveAccolade` did that when it was
 * logged); it decides which of a card's events gets to speak, and that a card only ever makes one
 * claim however many sends it holds.
 */
describe('eventCard accolade', () => {
  const noon = new Date(2026, 0, 1, 12).getTime()
  const send = (partial: Partial<EventListItem> & { accolade?: unknown; name?: string } = {}) => {
    const { accolade, name = 'Hazel Nut', ...rest } = partial
    return event({
      entity: { accolade, climbedAt: noon, crumbs: [], href: '/routes/1', name, row: 'route' } as never,
      objectType: 'ascent',
      verb: 'create',
      ...rest,
    })
  }

  it('lifts a card carrying a claim to hero, and names the route it is about', () => {
    const view = eventCard(
      groupEvents([send({ accolade: { days: 124, kind: 'project', sessions: 23 } })])[0],
      1,
      undefined,
      undefined,
      'mixed',
    )

    expect(view.tier).toBe('hero')
    expect(view.accolade).toEqual({ accolade: { days: 124, kind: 'project', sessions: 23 }, name: 'Hazel Nut' })
  })

  it('leaves a send with no claim at standard, so big keeps meaning something', () => {
    const view = eventCard(groupEvents([send()])[0], 1, undefined, undefined, 'mixed')

    expect(view.tier).toBe('standard')
    expect(view.accolade).toBeUndefined()
  })

  it('makes one claim for a session holding two, and prefers effort over grade', () => {
    // The afternoon stays one card. The notable ascent is not lifted out: it already has its own
    // row and its own reaction bar in here.
    const [group, ...rest] = groupEvents([
      send({ accolade: { kind: 'ceiling' }, createdAt: noon, id: 2, name: 'Kante', objectId: 20 }),
      send({
        accolade: { days: 124, kind: 'project', sessions: 23 },
        createdAt: noon - 60_000,
        id: 1,
        objectId: 21,
      }),
    ])

    expect(rest).toHaveLength(0)
    expect(eventCard(group, 1, undefined, undefined, 'mixed').accolade?.accolade).toEqual({
      days: 124,
      kind: 'project',
      sessions: 23,
    })
  })

  it('lets the community fill an empty banner slot', () => {
    const view = eventCard(
      groupEvents([event({ objectType: 'route', promoted: true, verb: 'create' })])[0],
      1,
      undefined,
      undefined,
      'mixed',
    )

    expect(view.accolade?.accolade).toEqual({ kind: 'community' })
    expect(view.tier).toBe('hero')
  })

  it('lets the climb outrank the applause when both would claim the slot', () => {
    // The reaction count is already visible in the bar directly below, so a card that has both
    // says the rarer thing.
    const view = eventCard(
      groupEvents([send({ accolade: { kind: 'ceiling' }, promoted: true })])[0],
      1,
      undefined,
      undefined,
      'mixed',
    )

    expect(view.accolade?.accolade).toEqual({ kind: 'ceiling' })
  })

  it('does not promote a compacted edit out of its quiet row', () => {
    // A rename that three people reacted to is still a rename. Ungated, the promotion lifted it
    // straight to hero with a banner calling the rename a community favourite, which is
    // the exact inversion of what the compact tier is for.
    const view = eventCard(
      groupEvents([event({ objectType: 'route', promoted: true, verb: 'update' })])[0],
      1,
      undefined,
      undefined,
      'mixed',
    )

    expect(view.tier).toBe('compact')
    expect(view.accolade).toBeUndefined()
  })

  it('refuses to compact a rename somebody has already reacted to', () => {
    // The compact row has no reaction bar, so compacting this would hide a chip a reader can no
    // longer see or take back. That invariant outranks the tier.
    const view = eventCard(
      groupEvents([
        event({ objectType: 'route', reactions: [{ emoji: '🔥', userFk: 3, userName: 'mara' }], verb: 'update' }),
      ])[0],
      1,
      undefined,
      undefined,
      'mixed',
    )

    expect(view.tier).toBe('standard')
  })

  it('refuses to compact a rename with a thread under it', () => {
    const view = eventCard(
      groupEvents([event({ commentCount: 6, objectType: 'route', verb: 'update' })])[0],
      1,
      undefined,
      undefined,
      'mixed',
    )

    expect(view.tier).toBe('standard')
  })

  it('does not congratulate anybody for a popular deletion', () => {
    const view = eventCard(
      groupEvents([event({ objectType: 'route', promoted: true, verb: 'delete' })])[0],
      1,
      undefined,
      undefined,
      'mixed',
    )

    expect(view.accolade).toBeUndefined()
    expect(view.tier).toBe('standard')
  })

  it('does not let an edit to an ascent congratulate anybody', () => {
    // The claim is read off the ascent row, which an update event points at just as well. Only the
    // card that LOGGED the send may speak it, or correcting a typo re-announces the achievement.
    const view = eventCard(
      groupEvents([send({ accolade: { kind: 'ceiling' }, verb: 'update' })])[0],
      1,
      undefined,
      undefined,
      'mixed',
    )

    expect(view.accolade).toBeUndefined()
    expect(view.tier).toBe('standard')
  })
})
