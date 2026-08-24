import { describe, expect, it } from 'vitest'
import { cardView, type CardGroup } from './cardView'
import type { EventEntity, EventEntityMap } from './entity'
import type { EventEntityRef } from './entity'
import type { CardLine } from './line'
import { entityMap, group, line } from './line.fixture'
import { WRITTEN_ROWS } from './verbs'

/** The card for a set of events, folded exactly as the feed folds them. */
/**
 * The card those lines make.
 *
 * `kind` is an INPUT here, where the feed reads it off `groupEvents`. These are unit tests of what
 * a card decides given a kind, so stating it is the point rather than a shortcut: `grouping.ts`
 * has its own tests for which kind a set of events gets.
 */
function card(
  rows: CardLine[],
  entities?: EventEntityMap,
  currentUserFk?: number,
  omit?: EventEntityRef,
  kind?: CardGroup['kind'],
) {
  return cardView(group(rows, kind), entities, currentUserFk, undefined, omit)
}

const route = (name: string): EventEntity => ({ name, row: 'route' })

/** One logged ascent, which groups into a session keyed on the climber alone. */
function ascentRow(partial: Partial<CardLine>): CardLine {
  return line({
    actorFk: 3,
    objectType: 'ascent',
    parentType: 'route',
    value: 'flash',
    verb: 'create',
    ...partial,
  })
}

/**
 * Guidebook edits under one block, which is what makes them one burst: the key is the actor plus
 * the parent, so rows without a shared parent would each get their own card.
 */
function burstRows(count: number, partial: (index: number) => Partial<CardLine>): CardLine[] {
  return Array.from({ length: count }, (_, index) => line({ parentId: '400', parentType: 'block', ...partial(index) }))
}

describe('headline keys', () => {
  it('takes a single card s verb from the column that changed', () => {
    expect(card([line({ columnName: 'gradeFk' })]).headline.key).toBe('event_routeUpdatedGradeFk')
  })

  it('reads a new ascent s verb from its ascent type rather than a column', () => {
    expect(card([line({ objectType: 'ascent', value: 'redpoint', verb: 'create' })]).headline.key).toBe(
      'event_ascentCreatedRedpoint',
    )
  })

  it('uses the whole-entity verb when nothing scopes the change', () => {
    expect(card([line({ verb: 'delete' })]).headline.key).toBe('event_routeDeleted')
  })

  it('summarises a group rather than speaking one of its rows verbs', () => {
    const rows = burstRows(2, (index) => ({ columnName: 'name', objectId: String(index) }))
    expect(card(rows).headline.key).toBe('event_groupEdits')
  })

  // One person, one entity, one kind of change. "Edited" is true of four topo saves and of
  // three photo removals alike, and says nothing about either.
  it('speaks the shared verb when a group is one kind of change on one entity', () => {
    const rows = burstRows(4, () => ({ columnName: 'topo', objectId: '400', objectType: 'block' as const }))
    expect(card(rows).headline.key).toBe('event_blockUpdatedTopo')
  })

  // The guard on the above: a row's own sentence puts its entity in `{name}`, and a group over
  // two routes has none to put there, so it would borrow the block's and rename the block.
  it('falls back to the summary verb when one kind of change spans two entities', () => {
    const rows = burstRows(2, (index) => ({
      columnName: 'topo',
      objectId: String(400 + index),
      objectType: 'block' as const,
    }))
    expect(card(rows).headline.key).toBe('event_groupEdits')
  })

  it('says media when a grouped removal took both a photo and a video', () => {
    const rows = burstRows(2, (index) => ({
      columnName: 'file',
      objectId: '500',
      oldValue: index === 0 ? 'video' : 'photo',
      verb: 'remove' as const,
    }))

    expect(card(rows).headline).toMatchObject({ key: 'event_routeDeletedFile', params: { media: 'none' } })
  })

  // A route added with two photos is one event: its own verb, and a summary counting the media
  // rather than calling the create itself an edit.
  it('speaks the create s verb and counts the media when a create picked up files', () => {
    const created = line({
      createdAt: 100,
      id: 1,
      newValue: 'Kante',
      objectId: '9',
      parentId: '400',
      parentType: 'block',
      verb: 'create',
    })
    const files = [1, 2].map((index) =>
      line({
        createdAt: 100 + index,
        id: index + 1,
        objectId: `f${index}`,
        objectType: 'file',
        parentId: '9',
        parentType: 'route',
        verb: 'add',
      }),
    )
    // The create leads, which is what the feed's merge does: a card speaks the verb at its front.
    const view = card([created, ...files], undefined, undefined, undefined, 'upload')

    expect(view.headline.key).toBe('event_routeCreated')
    expect(view.summary).toEqual([{ key: 'event_summaryFiles', params: { count: 2, media: 'none' } }])
  })

  // Three edits to one ascent are not a session and are not three ascents. Once the headline
  // says what actually happened, the count is of edits.
  it('speaks the change and counts edits when a session is really edits to one ascent', () => {
    const rows = ['type', 'gradeFk', 'notes'].map((columnName, index) =>
      line({ columnName, createdAt: 100 - index, id: index + 1, objectId: '9001', objectType: 'ascent' }),
    )
    const view = card(rows, undefined, undefined, undefined, 'session')

    expect(view.headline.key).toBe('event_ascentUpdated')
    expect(view.summary).toEqual([{ key: 'event_summaryEdits', params: { count: 3 } }])
  })

  // A real session still counts ascents, and an ascent edited as well as logged is one ascent.
  it('counts ascents rather than rows in a genuine session', () => {
    const rows = [
      line({ createdAt: 100, id: 1, objectId: '9001', objectType: 'ascent', value: 'flash', verb: 'create' }),
      line({ columnName: 'gradeFk', createdAt: 99, id: 2, objectId: '9001', objectType: 'ascent' }),
      line({ createdAt: 98, id: 3, objectId: '9002', objectType: 'ascent', value: 'redpoint', verb: 'create' }),
    ]

    expect(card(rows, undefined, undefined, undefined, 'session').summary).toEqual([
      { key: 'event_summaryAscents', params: { count: 2 } },
    ])
  })

  // A deletion is the one card whose subject cannot be followed, so the scale of it is the
  // only thing that can answer "how bad was that".
  it('reports what a deletion took with it, summed over the card', () => {
    const rows = burstRows(2, (index) => ({
      metadata: JSON.stringify({ blocks: index + 1, routes: 10 }),
      objectId: String(index),
      objectType: 'area' as const,
      parentType: 'area' as const,
      verb: 'delete' as const,
    }))

    expect(card(rows).summary).toEqual([
      { key: 'event_summaryBlocks', params: { count: 3 } },
      { key: 'event_summaryRoutes', params: { count: 20 } },
    ])
  })

  it('leaves a deletion logged before the counts existed exactly as it was', () => {
    const rows = [line({ verb: 'delete' })]
    expect(card(rows).summary).toBeUndefined()
  })

  // A topo row's metadata shares the column and is not JSON.
  it('ignores metadata that is not a deletion scale', () => {
    const rows = [line({ metadata: 'lines:700', objectType: 'block', verb: 'delete' })]
    expect(card(rows).summary).toBeUndefined()
  })

  it('says a group of deletions deleted rather than edited', () => {
    const rows = burstRows(2, (index) => ({ objectId: String(index), verb: 'delete' as const }))
    expect(card(rows, undefined, undefined, undefined, 'removal').headline.key).toBe('event_groupRemovals')
    expect(card(rows, undefined, undefined, undefined, 'removal').summary).toEqual([
      { key: 'event_summaryRemovals', params: { count: 2 } },
    ])
  })

  // The catalogue is type-checked against paraglide, so this is about the lookup rather than
  // the keys: a row the mutation layer writes must find its own entry, not degrade past it.
  it('resolves every event the mutation layer writes to its catalogue entry', () => {
    const degraded = WRITTEN_ROWS.map((partial) => ({
      key: card([line(partial)]).headline.key,
      partial,
    })).filter(({ key }) => key === 'event_genericChange')

    expect(degraded).toEqual([])
  })
})

describe('headline name', () => {
  it('prefers the hydrated entity', () => {
    const rows = [line({ oldValue: 'Altweg', verb: 'delete' })]
    expect(card(rows, entityMap([[{ id: '1', type: 'route' }, route('Rampe')]])).entityName).toBe('Rampe')
  })

  it('falls back to the name a create or delete row stashed', () => {
    const gone = entityMap([[{ id: '1', type: 'route' }, null]])
    expect(card([line({ newValue: 'Neuweg', verb: 'create' })], gone).entityName).toBe('Neuweg')
    expect(card([line({ oldValue: 'Altweg', verb: 'delete' })], gone).entityName).toBe('Altweg')
  })

  it('never borrows a column value that is not a name', () => {
    // A grade id in the headline would read as "changed the grade of 15".
    expect(card([line({ columnName: 'gradeFk', newValue: '15' })]).entityName).toBeUndefined()
    expect(card([line({ columnName: 'name', newValue: 'Kante direkt' })]).entityName).toBe('Kante direkt')
  })

  it('never reads an ascent row, whose values are ascent types', () => {
    expect(card([line({ objectType: 'ascent', value: 'flash', verb: 'create' })]).entityName).toBeUndefined()
  })

  // A deleted ascent stores no name of its own, so the route it hung on is the only true name
  // left. Without this the card fell to `common_unnamed` for an ascent whose route is right there.
  it('borrows the parent when the entry stores no name to fall back on', () => {
    const rows = [
      line({
        objectId: '9001',
        objectType: 'ascent',
        parentId: '501',
        parentType: 'route',
        verb: 'delete',
      }),
    ]
    const entities = entityMap([
      [{ id: '9001', type: 'ascent' }, null],
      [{ id: '501', type: 'route' }, route('Riss')],
    ])

    expect(card(rows, entities).entityName).toBe('Riss')
  })

  // The guard on the above: a route DOES stash its name, so a missing one is genuinely missing
  // and must not be filled in with the block it hung on.
  it('never borrows the parent for an entry that does stash a name', () => {
    const rows = [line({ oldValue: '', parentId: '400', parentType: 'block', verb: 'delete' })]
    const entities = entityMap([
      [{ id: '1', type: 'route' }, null],
      [
        { id: '400', type: 'block' },
        { name: 'Nordblock', row: 'block' },
      ],
    ])

    expect(card(rows, entities).entityName).toBeUndefined()
    expect(card(rows, entities).entityUnnamed).toBe(true)
  })

  it('borrows a user row s value, which is the person', () => {
    expect(
      card([line({ columnName: 'invitation', newValue: 'sofia@example.com', objectType: 'user', verb: 'invite' })])
        .entityName,
    ).toBe('sofia@example.com')
  })

  it('treats an empty name column as no name at all', () => {
    // A route added without a name stores `''`, which reached the screen as a blank slot.
    expect(card([line({ newValue: '', verb: 'create' })]).entityName).toBeUndefined()
  })

  it('says a name is missing rather than waiting for one', () => {
    // Nothing syncs any more: an entity arrives with its event, so a slot with no name in it is
    // a slot that will never have one and says so instead of pulsing.
    const rows = [line({ oldValue: '', verb: 'delete' })]
    expect(card(rows).entityUnnamed).toBe(true)
    expect(card(rows, entityMap([[{ id: '1', type: 'route' }, null]])).entityUnnamed).toBe(true)
    expect(card(rows, entityMap([[{ id: '1', type: 'route' }, route('Rampe')]])).entityUnnamed).toBe(false)
  })

  it('names the place a burst agrees on', () => {
    const rows = [
      line({ columnName: 'name', id: 1, objectId: '1', parentId: '400', parentType: 'block' }),
      line({ columnName: 'rating', id: 2, objectId: '2', parentId: '400', parentType: 'block' }),
    ]
    const entities = entityMap([
      [
        { id: '400', type: 'block' },
        { name: 'Nordblock', row: 'block' },
      ],
    ])

    expect(card(rows, entities).entityName).toBe('Nordblock')
  })

  it('has no place when the rows disagree on their parent', () => {
    // A session keys on the climber alone, so two ascents on two routes share a card while
    // disagreeing about where they happened. It then falls back to its first entity.
    const rows = [
      ascentRow({ createdAt: 2, id: 1, objectId: '9001', parentId: '5' }),
      ascentRow({ createdAt: 1, id: 2, objectId: '9002', parentId: '6' }),
    ]
    const entities = entityMap([
      [{ id: '5', type: 'route' }, route('Westwand')],
      [{ id: '9001', type: 'ascent' }, route('Kante')],
    ])

    expect(card(rows, entities).entityName).toBe('Kante')
  })
})

describe('rows', () => {
  it('is a tombstone whether the entity is absent or explicitly gone', () => {
    const rows = burstRows(2, (index) => ({
      id: 2 - index,
      objectId: String(index + 1),
      oldValue: 'Altweg',
      verb: 'delete',
    }))
    const view = card(rows, entityMap([[{ id: '1', type: 'route' }, null]]))

    expect(view.rows.map((row) => row.state)).toEqual(['tombstone', 'tombstone'])
  })

  it('names a tombstone from the row that named it, not the group s newest', () => {
    // Both routes are gone; labelling both with the newest row's name would be a lie.
    const rows = burstRows(2, (index) => ({
      id: 2 - index,
      objectId: String(index + 1),
      oldValue: ['Neuweg', 'Altweg'][index],
      verb: 'delete',
    }))
    const entities = entityMap([
      [{ id: '1', type: 'route' }, null],
      [{ id: '2', type: 'route' }, null],
    ])

    expect(card(rows, entities).rows.map((row) => row.name)).toEqual(['Neuweg', 'Altweg'])
  })

  it('collapses everything past the fourth row into a count', () => {
    const view = card(burstRows(6, (index) => ({ columnName: 'name', id: 6 - index, objectId: String(index) })))

    expect(view.rows).toHaveLength(4)
    expect(view.overflowCount).toBe(2)
  })

  // The scoped log renders on the entity's own page, where every row is a link back to it.
  it('drops the row for the entity the card is rendered on', () => {
    const view = card([line({ columnName: 'gradeFk', objectId: '7' })], undefined, undefined, {
      id: '7',
      type: 'route',
    })

    expect(view.rows).toEqual([])
    // The sentence still names it: the headline is one translated string, not a fragment.
    expect(view.headline.key).toBe('event_routeUpdatedGradeFk')
  })

  it('keeps the rows that are not the entity the card is rendered on', () => {
    const rows = burstRows(2, (index) => ({ columnName: 'name', id: 2 - index, objectId: String(index + 1) }))
    const view = card(rows, undefined, undefined, { id: '1', type: 'route' })

    expect(view.rows.map((row) => row.ref.id)).toEqual(['2'])
  })

  it('counts the overflow after the omitted row is gone', () => {
    const rows = burstRows(6, (index) => ({ columnName: 'name', id: 6 - index, objectId: String(index) }))
    const view = card(rows, undefined, undefined, { id: '0', type: 'route' })

    expect(view.rows).toHaveLength(4)
    // Five rows left, not six: an overflow counted before the filter would say "2 more".
    expect(view.overflowCount).toBe(1)
  })
})

describe('summary', () => {
  const session = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      line({
        actorFk: 3,
        createdAt: index * 60_000,
        id: index,
        objectId: String(9000 + index),
        objectType: 'ascent',
        parentId: '5',
        parentType: 'route',
        value: 'redpoint',
        verb: 'create',
      }),
    )

  it('has none on a single card', () => {
    expect(card([line({})]).summary).toBeUndefined()
  })

  it('counts a session and names the place it happened', () => {
    const entities = entityMap([[{ id: '5', type: 'route' }, route('Westwand')]])

    expect(card(session(3), entities, undefined, undefined, 'session').summary).toEqual([
      { key: 'event_summaryAscents', params: { count: 3 } },
      { text: 'Westwand' },
    ])
  })

  it('does not repeat the place an edits headline already named', () => {
    const rows = [
      line({
        columnName: 'name',
        createdAt: 2,
        id: 1,
        objectId: '1',
        parentId: '400',
        parentType: 'block',
      }),
      line({
        columnName: 'rating',
        createdAt: 1,
        id: 2,
        objectId: '2',
        parentId: '400',
        parentType: 'block',
      }),
    ]
    const entities = entityMap([
      [
        { id: '400', type: 'block' },
        { name: 'Nordblock', row: 'block' },
      ],
    ])
    const view = card(rows, entities)

    expect(view.entityName).toBe('Nordblock')
    expect(view.summary).toEqual([{ key: 'event_summaryEdits', params: { count: 2 } }])
  })

  it('counts files, not edits, on a card that only removed media', () => {
    const removal = (partial: Partial<CardLine>) =>
      line({
        columnName: 'file',
        objectId: '500',
        parentId: '400',
        parentType: 'block',
        verb: 'remove',
        ...partial,
      })

    // Two photos off one route: the card knows it is about media, so "2 edits" reaches for
    // the generic word when it has the specific one.
    expect(
      card(
        [removal({ createdAt: 2, id: 1, oldValue: 'photo' }), removal({ createdAt: 1, id: 2, oldValue: 'photo' })],
        undefined,
        undefined,
        undefined,
        'entity',
      ).summary,
    ).toEqual([{ key: 'event_summaryFiles', params: { count: 2, media: 'photo' } }])

    // A photo and a video agree on neither word, which is the arm that says "files".
    expect(
      card([removal({ createdAt: 2, id: 1, oldValue: 'photo' }), removal({ createdAt: 1, id: 2, oldValue: 'video' })])
        .summary,
    ).toEqual([{ key: 'event_summaryFiles', params: { count: 2, media: 'none' } }])
  })

  it('speaks one shared verb for a group of one person s edits to one entity', () => {
    // Every group key carries the actor now, so a card is one person's doing and there is no
    // "and others" arm left to reach. `grouping.test.ts` holds the guard that keeps it that way.
    const rows = [
      line({ actorFk: 1, columnName: 'role', createdAt: 2, id: 1, objectId: '5', objectType: 'user' }),
      line({ actorFk: 1, columnName: 'role', createdAt: 1, id: 2, objectId: '5', objectType: 'user' }),
    ]
    const view = card(rows)

    expect(view.headline.key).toBe('event_userUpdatedRole')
    expect(view.summary).toEqual([{ key: 'event_summaryEdits', params: { count: 2 } }])
  })
})

describe('person and owner', () => {
  it('reads as yours when you are the actor', () => {
    expect(card([line({ actorFk: 7 })], undefined, 7).headline.params.person).toBe('self')
    expect(card([line({ actorFk: 7 })], undefined, 8).headline.params.person).toBe('other')
    expect(card([line({ actorFk: 7 })]).headline.params.person).toBe('other')
  })

  it('says whose ascent it is, and says nothing about one it cannot resolve', () => {
    const rows = [line({ actorFk: 7, objectId: '9', objectType: 'ascent' })]
    const own = entityMap([
      [
        { id: '9', type: 'ascent' },
        { climberFk: 7, name: 'Rampe', row: 'route' },
      ],
    ])
    const theirs = entityMap([
      [
        { id: '9', type: 'ascent' },
        { climberFk: 3, name: 'Rampe', row: 'route' },
      ],
    ])

    expect(card(rows, own).headline.params.owner).toBe('self')
    expect(card(rows, theirs).headline.params.owner).toBe('other')
    // Every ascent sentence catches this with `owner=*`, the same arm `other` reads.
    expect(card(rows).headline.params.owner).toBe('none')
  })

  it('reads whose deleted ascent it was off the row that deleted it', () => {
    // A deleted ascent never hydrates: the row is gone in the same transaction that logs this.
    // Without the recorded climber every removal reads "removed an ascent of Rampe", which is
    // the one thing a card about somebody else's log must not say.
    const removal = (climberFk: number) =>
      card([
        line({
          actorFk: 7,
          metadata: JSON.stringify({ climberFk, climberName: 'Ada Rossi' }),
          objectId: '9',
          objectType: 'ascent',
          oldValue: 'flash',
          verb: 'delete',
        }),
      ])

    expect(removal(7).headline.params.owner).toBe('self')
    expect(removal(3).headline.params.owner).toBe('other')
    expect(removal(3).climberName).toBe('Ada Rossi')
    // A row from before the climber was recorded still degrades to the vaguer sentence.
    expect(
      card([line({ actorFk: 7, objectId: '9', objectType: 'ascent', verb: 'delete' })]).headline.params.owner,
    ).toBe('none')
  })

  it('reads whose ascent an upload landed on off the parent', () => {
    // The row points at the file, so the ascent is only ever the parent. Without it the card
    // says "added a video to Karma" for something added to a climber's own ascent of it.
    const rows = [
      line({
        actorFk: 7,
        objectId: 'f1',
        objectType: 'file',
        parentId: '9',
        parentType: 'ascent',
        verb: 'add',
      }),
    ]
    const entities = entityMap([
      [
        { id: '9', type: 'ascent' },
        { climberFk: 7, name: 'Karma', row: 'route' },
      ],
      [
        { id: 'f1', type: 'file' },
        { files: [{ bunnyStreamFk: 'guid', id: 'f1' } as never], name: '', row: 'none' },
      ],
    ])

    expect(card(rows, entities).headline.params.owner).toBe('self')
    expect(card(rows, entities).entityName).toBe('Karma')
  })
})

describe('uploads', () => {
  const upload = (partial: Partial<CardLine>) =>
    line({
      actorFk: 3,
      objectType: 'file',
      parentId: '400',
      parentType: 'block',
      verb: 'add',
      ...partial,
    })

  const block = entityMap([
    [
      { id: '400', type: 'block' },
      { name: 'Nordblock', row: 'block' },
    ],
    [
      { id: 'f1', type: 'file' },
      { name: 'Nordblock', row: 'none' },
    ],
  ])

  it('names what the photo landed on, never the file', () => {
    // A file's own id is a cuid, so borrowing it for the headline would read as noise.
    const view = card([upload({ id: 1, objectId: 'f1' })], block)

    expect(view.headline.key).toBe('event_fileUploaded')
    expect(view.entityName).toBe('Nordblock')
  })

  it('summarises a submit rather than naming one of its photos', () => {
    const rows = [1, 2, 3].map((n) => upload({ createdAt: 60_000 * n, id: n, objectId: `f${n}` }))
    const view = card(rows, block, undefined, undefined, 'upload')

    expect(view.headline.key).toBe('event_groupUploads')
    expect(view.summary).toEqual([{ key: 'event_summaryFiles', params: { count: 3, media: 'none' } }])
    expect(view.entityName).toBe('Nordblock')
  })

  it('says which kind of media landed, and neither word for a mixed submit', () => {
    // Off the hydrated file rather than the row: the row records that a file was added and
    // nothing about what it was, so every upload logged before this would read as a photo.
    const file = (id: string, video: boolean): [{ id: string; type: 'file' }, EventEntity] => [
      { id, type: 'file' },
      { files: [{ bunnyStreamFk: video ? 'guid' : undefined, id } as never], name: '', row: 'none' },
    ]
    const rows = [1, 2].map((n) => upload({ createdAt: 60_000 * n, id: n, objectId: `f${n}` }))
    const mediaOf = (entries: Parameters<typeof entityMap>[0]) => card(rows, entityMap(entries)).headline.params.media

    expect(mediaOf([file('f1', true), file('f2', true)])).toBe('video')
    expect(mediaOf([file('f1', false), file('f2', false)])).toBe('photo')
    expect(mediaOf([file('f1', true), file('f2', false)])).toBe('none')
    expect(mediaOf([])).toBe('none')
  })

  it('lists a file once when the upload merged into the create it belongs to', () => {
    // Logging an ascent with a clip is one card built from two rows, and both of them answer
    // with the same file: the ascent hydrates with it hanging off it, the upload row hydrates
    // with it directly. The thumbnails are keyed by file id, so a second copy is a crash.
    const clip = [{ bunnyStreamFk: 'guid', id: 'f1' }] as never
    const rows = [
      ascentRow({ createdAt: 0, id: 1, objectId: '9001', parentId: '500' }),
      upload({ createdAt: 60_000, id: 2, objectId: 'f1', parentId: '9001', parentType: 'ascent' }),
    ]
    const entities = entityMap([
      [
        { id: '9001', type: 'ascent' },
        { ascentType: 'flash', files: clip, name: 'Rampe', row: 'route' },
      ],
      [
        { id: 'f1', type: 'file' },
        { files: clip, name: '', row: 'none' },
      ],
    ])

    expect(card(rows, entities).files.map((file) => file.id)).toEqual(['f1'])
  })

  it('takes a removal s word off the row, since the file it named is gone', () => {
    const removal = (oldValue: string | undefined) =>
      card([line({ columnName: 'file', objectId: '9', objectType: 'ascent', oldValue, verb: 'remove' })]).headline
        .params.media

    expect(removal('video')).toBe('video')
    expect(removal('photo')).toBe('photo')
    // Written before the word was stored. Still true, just vaguer.
    expect(removal(undefined)).toBe('none')
  })

  // The media comes off the file, the row comes off what the file was attached to. A file's own
  // name is a cuid and its only page is the media viewer, so a row for it leads nowhere.
  it('renders the parent as the row for an upload, and the file as its media', () => {
    const entities = entityMap([
      [
        { id: '400', type: 'block' },
        { name: 'Nordblock', row: 'block' },
      ],
      [
        { id: 'f1', type: 'file' },
        { files: [{ id: 'f1' } as never], name: 'Nordblock', row: 'none' },
      ],
    ])
    const view = card([upload({ id: 1, objectId: 'f1' })], entities)

    expect(view.rows.map((row) => row.ref)).toEqual([{ id: '400', type: 'block' }])
    expect(view.rows.map((row) => row.entity?.row)).toEqual(['block'])
    expect(view.files).toHaveLength(1)
  })

  // Five photos from one submit all name the same parent, so the card shows one row, not five.
  it('collapses a multi-file upload onto the one parent row', () => {
    const entities = entityMap([
      [
        { id: '400', type: 'block' },
        { name: 'Nordblock', row: 'block' },
      ],
      ...Array.from({ length: 3 }, (_, index): [{ id: string; type: 'file' }, EventEntity] => [
        { id: `f${index}`, type: 'file' },
        { files: [{ id: `f${index}` } as never], name: 'Nordblock', row: 'none' },
      ]),
    ])
    const view = card(
      Array.from({ length: 3 }, (_, index) => upload({ id: index + 1, objectId: `f${index}` })),
      entities,
    )

    expect(view.rows).toHaveLength(1)
    expect(view.files).toHaveLength(3)
  })

  // A member who was removed is out of the region, so their row is a dead end even while the
  // entity still hydrates. The headline still names them.
  it('renders no row for a member removal or a departure', () => {
    const entities = entityMap([
      [
        { id: '5', type: 'user' },
        { name: 'Mara Lindqvist', row: 'user' },
      ],
    ])
    const removed = card([line({ columnName: 'role', objectId: '5', objectType: 'user', verb: 'remove' })], entities)
    const left = card([line({ columnName: 'membership', objectId: '5', objectType: 'user', verb: 'leave' })], entities)

    expect(removed.rows).toEqual([])
    expect(removed.entityName).toBe('Mara Lindqvist')
    expect(left.rows).toEqual([])
  })
})

// The change list itself is `change.ts`, tested there. What belongs to the card is that it
// carries one, decided from the same rows the headline read.
describe('changes', () => {
  it('carries a line per column the catalogue knows, and none for a create', () => {
    const rows = [
      line({ columnName: 'gradeFk', createdAt: 2, id: 1 }),
      line({ columnName: 'somethingNobodyWrites', createdAt: 1, id: 2 }),
    ]

    expect(card(rows).changes.map((change) => change.kind)).toEqual(['grade'])
    expect(card([line({ verb: 'create' })]).changes).toEqual([])
  })
})

describe('create cards', () => {
  const pin = { estimated: false, id: 1, lat: 47.1, long: 8.5 }
  const blockRow = (partial: Partial<CardLine> = {}) =>
    line({ newValue: 'Nordblock', objectId: '400', objectType: 'block', verb: 'create', ...partial })

  it('draws the pin a block was placed with', () => {
    const entities = entityMap([
      [
        { id: '400', type: 'block' },
        { name: 'Nordblock', pin, row: 'block' },
      ],
    ])

    expect(card([blockRow()], entities).pin).toEqual(pin)
  })

  it('draws no pin for a block created without one', () => {
    const entities = entityMap([
      [
        { id: '400', type: 'block' },
        { name: 'Nordblock', row: 'block' },
      ],
    ])

    expect(card([blockRow()], entities).pin).toBeUndefined()
  })

  it('draws no pin on an edit, which renders its own before-and-after map', () => {
    const entities = entityMap([
      [
        { id: '400', type: 'block' },
        { name: 'Nordblock', pin, row: 'block' },
      ],
    ])

    expect(card([blockRow({ columnName: 'name', newValue: 'Sudblock', verb: 'update' })], entities).pin).toBeUndefined()
  })

  it("carries the climber's own grade, rating and conditions", () => {
    const entities = entityMap([
      [
        { id: '9001', type: 'ascent' },
        {
          ascentGradeFk: 14,
          ascentRating: 3,
          ascentType: 'flash',
          humidity: 45,
          name: 'Rampe',
          row: 'route',
          temperature: 18,
        },
      ],
    ])

    // On the ROW, not on the card: a session logs several ascents and each carries its own.
    expect(card([ascentRow({ objectId: '9001' })], entities).rows[0].ascent).toEqual({
      gradeFk: 14,
      humidity: 45,
      rating: 3,
      temperature: 18,
    })
  })

  it('gives each ascent of a session its own numbers', () => {
    const entities = entityMap([
      [
        { id: '9001', type: 'ascent' },
        { ascentGradeFk: 14, ascentType: 'flash', name: 'Rampe', note: 'First go.', row: 'route' },
      ],
      [
        { id: '9002', type: 'ascent' },
        { ascentGradeFk: 9, ascentRating: 2, ascentType: 'attempt', name: 'Riss', row: 'route' },
      ],
    ])

    const rows = card([ascentRow({ objectId: '9001' }), ascentRow({ objectId: '9002' })], entities).rows

    expect(rows.map((row) => [row.ascent?.gradeFk, row.ascent?.rating, row.note])).toEqual([
      [14, undefined, 'First go.'],
      [9, 2, undefined],
    ])
  })

  it('says nothing about an ascent the card only edited', () => {
    // The change lines already say which number moved, and the strip would repeat the answer
    // beside the question.
    const entities = entityMap([
      [
        { id: '9001', type: 'ascent' },
        { ascentGradeFk: 14, ascentType: 'flash', name: 'Rampe', row: 'route' },
      ],
    ])

    const rows = card(
      [ascentRow({ columnName: 'rating', newValue: '3', objectId: '9001', verb: 'update' })],
      entities,
    ).rows

    expect(rows[0].ascent).toBeUndefined()
  })

  it('carries nothing for an ascent logged with no opinion at all', () => {
    // What every ascent starts as: a type and nothing else. A strip of placeholders under
    // most session cards would say less than no strip.
    const entities = entityMap([
      [
        { id: '9001', type: 'ascent' },
        { ascentRating: 0, ascentType: 'flash', name: 'Rampe', row: 'route' },
      ],
    ])

    expect(card([ascentRow({ objectId: '9001' })], entities).rows[0].ascent).toBeUndefined()
  })
})

describe('climb date', () => {
  const DAY = 86_400_000
  const HOUR = 3_600_000
  /** Logged on day 3 at 09:00 UTC, which is what `climbedAt` is compared against. */
  const LOGGED = 3 * DAY + 9 * HOUR
  const logged = (climbedAt: number | undefined, createdAt = LOGGED) =>
    card(
      [ascentRow({ createdAt, objectId: '9001' })],
      entityMap([
        [
          { id: '9001', type: 'ascent' },
          { ascentType: 'flash', climbedAt, name: 'Rampe', row: 'route' },
        ],
      ]),
    ).climbedAt

  /**
   * Read the card as somebody in `zone`. The line asks whether two calendar days differ, and
   * which day a moment falls on is a question only the reader's timezone answers, so a test
   * that pins no zone is really asserting whatever the machine running it is set to.
   */
  function inTimezone(zone: string, body: () => void) {
    const original = process.env.TZ
    process.env.TZ = zone
    try {
      body()
    } finally {
      process.env.TZ = original
    }
  }

  it('shows the day an ascent logged the morning after was climbed', () => {
    inTimezone('Europe/Berlin', () => expect(logged(2 * DAY)).toBe(2 * DAY))
  })

  it('stays quiet when the ascent was logged the day it was climbed', () => {
    inTimezone('Europe/Berlin', () => expect(logged(3 * DAY)).toBeUndefined())
  })

  it('stays quiet for a same-day log west of UTC, where the log moment is already tomorrow', () => {
    // 23:00 in Honolulu on the day of the climb is 09:00 UTC the next morning, so the two
    // sit 33 hours apart while being the same day to the person who climbed it.
    inTimezone('Pacific/Honolulu', () => expect(logged(2 * DAY)).toBeUndefined())
  })

  it('shows a one-day back-date east of UTC, where less than a day has passed', () => {
    // 09:00 in Auckland the morning after is 21 hours past the climb date's UTC midnight,
    // and a different calendar day to the reader, which is what the line reports.
    inTimezone('Pacific/Auckland', () => expect(logged(2 * DAY, 2 * DAY + 21 * HOUR)).toBe(2 * DAY))
  })

  it('stays quiet when nothing recorded a climb date', () => {
    expect(logged(undefined)).toBeUndefined()
  })

  it('stays quiet when a session spans two climb dates', () => {
    const rows = [
      ascentRow({ createdAt: LOGGED, id: 1, objectId: '9001' }),
      ascentRow({ createdAt: LOGGED - 60_000, id: 2, objectId: '9002' }),
    ]
    const entities = entityMap([
      [
        { id: '9001', type: 'ascent' },
        { ascentType: 'flash', climbedAt: DAY, name: 'Rampe', row: 'route' },
      ],
      [
        { id: '9002', type: 'ascent' },
        { ascentType: 'flash', climbedAt: 0, name: 'Kante', row: 'route' },
      ],
    ])

    expect(card(rows, entities).climbedAt).toBeUndefined()
  })
})
