import { describe, expect, it } from 'vitest'
import { activityCard } from './card'
import type { ActivityListItem } from './dto'
import { activityEntityKey, type ActivityEntity, type ActivityEntityMap } from './entity'
import { groupActivities } from './grouping'
import { WRITTEN_ACTIVITIES } from './verbs'

function activity(partial: Partial<ActivityListItem>): ActivityListItem {
  return {
    columnName: undefined,
    createdAt: 0,
    entityId: '1',
    entityType: 'route',
    id: 1,
    metadata: undefined,
    newValue: undefined,
    oldValue: undefined,
    parentEntityId: undefined,
    parentEntityType: undefined,
    regionFk: 1,
    type: 'updated',
    userFk: 1,
    userName: 'ada',
    ...partial,
  }
}

/** The card for a set of activities, folded exactly as the feed folds them. */
function card(activities: ActivityListItem[], entities?: ActivityEntityMap, currentUserFk?: number) {
  return activityCard(groupActivities(activities)[0], entities, currentUserFk)
}

function entityMap(entries: [{ id: string; type: ActivityListItem['entityType'] }, ActivityEntity | null][]) {
  return new Map(entries.map(([ref, entity]) => [activityEntityKey(ref), entity]))
}

const route = (name: string): ActivityEntity => ({ name, row: 'route' })

/** One logged ascent, which groups into a session keyed on the climber alone. */
function ascentRow(partial: Partial<ActivityListItem>): ActivityListItem {
  return activity({
    entityType: 'ascent',
    newValue: 'flash',
    parentEntityType: 'route',
    type: 'created',
    userFk: 3,
    ...partial,
  })
}

/**
 * Crag edits under one block, which is what makes them one burst: the key is the actor plus
 * the parent, so rows without a shared parent would each get their own card.
 */
function burstRows(count: number, partial: (index: number) => Partial<ActivityListItem>): ActivityListItem[] {
  return Array.from({ length: count }, (_, index) =>
    activity({ parentEntityId: '400', parentEntityType: 'block', ...partial(index) }),
  )
}

describe('headline keys', () => {
  it('takes a single card s verb from the column that changed', () => {
    expect(card([activity({ columnName: 'gradeFk' })]).headline.key).toBe('activity_routeUpdatedGradeFk')
  })

  it('reads a new ascent s verb from its ascent type rather than a column', () => {
    expect(card([activity({ entityType: 'ascent', newValue: 'redpoint', type: 'created' })]).headline.key).toBe(
      'activity_ascentCreatedRedpoint',
    )
  })

  it('uses the whole-entity verb when nothing scopes the change', () => {
    expect(card([activity({ type: 'deleted' })]).headline.key).toBe('activity_routeDeleted')
  })

  it('summarises a group rather than speaking one of its rows verbs', () => {
    const rows = burstRows(2, (index) => ({ columnName: 'name', entityId: String(index) }))
    expect(card(rows).headline.key).toBe('activity_groupEdits')
  })

  // One person, one entity, one kind of change. "Edited" is true of four topo saves and of
  // three photo removals alike, and says nothing about either.
  it('speaks the shared verb when a group is one kind of change on one entity', () => {
    const rows = burstRows(4, () => ({ columnName: 'topo', entityId: '400', entityType: 'block' as const }))
    expect(card(rows).headline.key).toBe('activity_blockUpdatedTopo')
  })

  // The guard on the above: a row's own sentence puts its entity in `{name}`, and a group over
  // two routes has none to put there, so it would borrow the block's and rename the block.
  it('falls back to the summary verb when one kind of change spans two entities', () => {
    const rows = burstRows(2, (index) => ({
      columnName: 'topo',
      entityId: String(400 + index),
      entityType: 'block' as const,
    }))
    expect(card(rows).headline.key).toBe('activity_groupEdits')
  })

  it('says media when a grouped removal took both a photo and a video', () => {
    const rows = burstRows(2, (index) => ({
      columnName: 'file',
      entityId: '500',
      oldValue: index === 0 ? 'video' : 'photo',
      type: 'deleted' as const,
    }))

    expect(card(rows).headline).toMatchObject({ key: 'activity_routeDeletedFile', params: { media: 'none' } })
  })

  // A route added with two photos is one event: its own verb, and a summary counting the media
  // rather than calling the create itself an edit.
  it('speaks the create s verb and counts the media when a create picked up files', () => {
    const created = activity({
      createdAt: 100,
      entityId: '9',
      id: 1,
      newValue: 'Kante',
      parentEntityId: '400',
      parentEntityType: 'block',
      type: 'created',
    })
    const files = [1, 2].map((index) =>
      activity({
        createdAt: 100 + index,
        entityId: `f${index}`,
        entityType: 'file',
        id: index + 1,
        parentEntityId: '9',
        parentEntityType: 'route',
        type: 'uploaded',
      }),
    )
    const view = card([...files, created])

    expect(view.headline.key).toBe('activity_routeCreated')
    expect(view.summary).toEqual([{ key: 'activity_summaryFiles', params: { count: 2, media: 'none' } }])
  })

  // Three edits to one ascent are not a session and are not three ascents. Once the headline
  // says what actually happened, the count is of edits.
  it('speaks the change and counts edits when a session is really edits to one ascent', () => {
    const rows = ['type', 'gradeFk', 'notes'].map((columnName, index) =>
      activity({ columnName, createdAt: 100 - index, entityId: '9001', entityType: 'ascent', id: index + 1 }),
    )
    const view = card(rows)

    expect(view.headline.key).toBe('activity_ascentUpdated')
    expect(view.summary).toEqual([{ key: 'activity_summaryEdits', params: { count: 3 } }])
  })

  // A real session still counts ascents, and an ascent edited as well as logged is one ascent.
  it('counts ascents rather than rows in a genuine session', () => {
    const rows = [
      activity({ createdAt: 100, entityId: '9001', entityType: 'ascent', id: 1, newValue: 'flash', type: 'created' }),
      activity({ columnName: 'gradeFk', createdAt: 99, entityId: '9001', entityType: 'ascent', id: 2 }),
      activity({ createdAt: 98, entityId: '9002', entityType: 'ascent', id: 3, newValue: 'redpoint', type: 'created' }),
    ]

    expect(card(rows).summary).toEqual([{ key: 'activity_summaryAscents', params: { count: 2 } }])
  })

  it('says a group of deletions deleted rather than edited', () => {
    const rows = burstRows(2, (index) => ({ entityId: String(index), type: 'deleted' as const }))
    expect(card(rows).headline.key).toBe('activity_groupRemovals')
    expect(card(rows).summary).toEqual([{ key: 'activity_summaryRemovals', params: { count: 2 } }])
  })

  // The catalogue is type-checked against paraglide, so this is about the lookup rather than
  // the keys: a row the mutation layer writes must find its own entry, not degrade past it.
  it('resolves every activity the mutation layer writes to its catalogue entry', () => {
    const degraded = WRITTEN_ACTIVITIES.map((partial) => ({
      key: card([activity(partial)]).headline.key,
      partial,
    })).filter(({ key }) => key === 'activity_genericChange')

    expect(degraded).toEqual([])
  })
})

describe('headline name', () => {
  it('prefers the hydrated entity', () => {
    const rows = [activity({ oldValue: 'Altweg', type: 'deleted' })]
    expect(card(rows, entityMap([[{ id: '1', type: 'route' }, route('Rampe')]])).entityName).toBe('Rampe')
  })

  it('falls back to the name a create or delete row stashed', () => {
    const gone = entityMap([[{ id: '1', type: 'route' }, null]])
    expect(card([activity({ newValue: 'Neuweg', type: 'created' })], gone).entityName).toBe('Neuweg')
    expect(card([activity({ oldValue: 'Altweg', type: 'deleted' })], gone).entityName).toBe('Altweg')
  })

  it('never borrows a column value that is not a name', () => {
    // A grade id in the headline would read as "changed the grade of 15".
    expect(card([activity({ columnName: 'gradeFk', newValue: '15' })]).entityName).toBeUndefined()
    expect(card([activity({ columnName: 'name', newValue: 'Kante direkt' })]).entityName).toBe('Kante direkt')
  })

  it('never reads an ascent row, whose values are ascent types', () => {
    expect(card([activity({ entityType: 'ascent', newValue: 'flash', type: 'created' })]).entityName).toBeUndefined()
  })

  // A deleted ascent stores no name of its own, so the route it hung on is the only true name
  // left. Without this the card said "<no name>" for an ascent whose route is right there.
  it('borrows the parent when the entry stores no name to fall back on', () => {
    const rows = [
      activity({
        entityId: '9001',
        entityType: 'ascent',
        parentEntityId: '501',
        parentEntityType: 'route',
        type: 'deleted',
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
    const rows = [activity({ oldValue: '', parentEntityId: '400', parentEntityType: 'block', type: 'deleted' })]
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
      card([activity({ columnName: 'invitation', entityType: 'user', newValue: 'sofia@example.com', type: 'created' })])
        .entityName,
    ).toBe('sofia@example.com')
  })

  it('treats an empty name column as no name at all', () => {
    // A route added without a name stores `''`, which reached the screen as a blank slot.
    expect(card([activity({ newValue: '', type: 'created' })]).entityName).toBeUndefined()
  })

  it('waits for a name only while one might still arrive', () => {
    const rows = [activity({ oldValue: '', type: 'deleted' })]
    expect(card(rows).entityUnnamed).toBe(false)
    expect(card(rows, entityMap([[{ id: '1', type: 'route' }, null]])).entityUnnamed).toBe(true)
    expect(card(rows, entityMap([[{ id: '1', type: 'route' }, route('Rampe')]])).entityUnnamed).toBe(false)
  })

  it('names the place a burst agrees on', () => {
    const rows = [
      activity({ columnName: 'name', entityId: '1', id: 1, parentEntityId: '400', parentEntityType: 'block' }),
      activity({ columnName: 'rating', entityId: '2', id: 2, parentEntityId: '400', parentEntityType: 'block' }),
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
      ascentRow({ createdAt: 2, entityId: '9001', id: 1, parentEntityId: '5' }),
      ascentRow({ createdAt: 1, entityId: '9002', id: 2, parentEntityId: '6' }),
    ]
    const entities = entityMap([
      [{ id: '5', type: 'route' }, route('Westwand')],
      [{ id: '9001', type: 'ascent' }, route('Kante')],
    ])

    expect(card(rows, entities).entityName).toBe('Kante')
  })
})

describe('rows', () => {
  it('is a skeleton while the entity has not synced, a tombstone once it is gone', () => {
    const rows = burstRows(2, (index) => ({
      entityId: String(index + 1),
      id: 2 - index,
      oldValue: 'Altweg',
      type: 'deleted',
    }))
    const view = card(rows, entityMap([[{ id: '1', type: 'route' }, null]]))

    expect(view.rows.map((row) => row.state)).toEqual(['tombstone', 'skeleton'])
  })

  it('names a tombstone from the row that named it, not the group s newest', () => {
    // Both routes are gone; labelling both with the newest row's name would be a lie.
    const rows = burstRows(2, (index) => ({
      entityId: String(index + 1),
      id: 2 - index,
      oldValue: ['Neuweg', 'Altweg'][index],
      type: 'deleted',
    }))
    const entities = entityMap([
      [{ id: '1', type: 'route' }, null],
      [{ id: '2', type: 'route' }, null],
    ])

    expect(card(rows, entities).rows.map((row) => row.name)).toEqual(['Neuweg', 'Altweg'])
  })

  it('collapses everything past the fourth row into a count', () => {
    const view = card(burstRows(6, (index) => ({ columnName: 'name', entityId: String(index), id: 6 - index })))

    expect(view.rows).toHaveLength(4)
    expect(view.overflowCount).toBe(2)
  })
})

describe('summary', () => {
  const session = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      activity({
        createdAt: index * 60_000,
        entityId: String(9000 + index),
        entityType: 'ascent',
        id: index,
        newValue: 'redpoint',
        parentEntityId: '5',
        parentEntityType: 'route',
        type: 'created',
        userFk: 3,
      }),
    )

  it('has none on a single card', () => {
    expect(card([activity({})]).summary).toBeUndefined()
  })

  it('counts a session and names the place it happened', () => {
    const entities = entityMap([[{ id: '5', type: 'route' }, route('Westwand')]])

    expect(card(session(3), entities).summary).toEqual([
      { key: 'activity_summaryAscents', params: { count: 3 } },
      { text: 'Westwand' },
    ])
  })

  it('does not repeat the place an edits headline already named', () => {
    const rows = [
      activity({
        columnName: 'name',
        createdAt: 2,
        entityId: '1',
        id: 1,
        parentEntityId: '400',
        parentEntityType: 'block',
      }),
      activity({
        columnName: 'rating',
        createdAt: 1,
        entityId: '2',
        id: 2,
        parentEntityId: '400',
        parentEntityType: 'block',
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
    expect(view.summary).toEqual([{ key: 'activity_summaryEdits', params: { count: 2 } }])
  })

  it('counts the people when an entity group mixes actors', () => {
    // Only `entity` groups can mix actors: a burst keys on the actor, so two people editing
    // the same crag get a card each. `user` rows are what fall through to `entity`.
    const rows = [
      activity({ columnName: 'role', createdAt: 2, entityId: '5', entityType: 'user', id: 1, userFk: 1 }),
      activity({ columnName: 'role', createdAt: 1, entityId: '5', entityType: 'user', id: 2, userFk: 2 }),
    ]
    const view = card(rows)

    expect(view.headline.key).toBe('activity_groupEditsMultiple')
    expect(view.summary).toContainEqual({ key: 'activity_summaryPeople', params: { count: 2 } })
  })
})

describe('person and owner', () => {
  it('reads as yours when you are the actor', () => {
    expect(card([activity({ userFk: 7 })], undefined, 7).headline.params.person).toBe('self')
    expect(card([activity({ userFk: 7 })], undefined, 8).headline.params.person).toBe('other')
    expect(card([activity({ userFk: 7 })]).headline.params.person).toBe('other')
  })

  it('says whose ascent it is, and says nothing about one it cannot resolve', () => {
    const rows = [activity({ entityId: '9', entityType: 'ascent', userFk: 7 })]
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

  it('reads whose ascent an upload landed on off the parent', () => {
    // The row points at the file, so the ascent is only ever the parent. Without it the card
    // says "added a video to Karma" for something added to a climber's own ascent of it.
    const rows = [
      activity({
        entityId: 'f1',
        entityType: 'file',
        parentEntityId: '9',
        parentEntityType: 'ascent',
        type: 'uploaded',
        userFk: 7,
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
  const upload = (partial: Partial<ActivityListItem>) =>
    activity({
      entityType: 'file',
      parentEntityId: '400',
      parentEntityType: 'block',
      type: 'uploaded',
      userFk: 3,
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
    const view = card([upload({ entityId: 'f1', id: 1 })], block)

    expect(view.headline.key).toBe('activity_fileUploaded')
    expect(view.entityName).toBe('Nordblock')
  })

  it('summarises a submit rather than naming one of its photos', () => {
    const rows = [1, 2, 3].map((n) => upload({ createdAt: 60_000 * n, entityId: `f${n}`, id: n }))
    const view = card(rows, block)

    expect(view.headline.key).toBe('activity_groupUploads')
    expect(view.summary).toEqual([{ key: 'activity_summaryFiles', params: { count: 3, media: 'none' } }])
    expect(view.entityName).toBe('Nordblock')
  })

  it('says which kind of media landed, and neither word for a mixed submit', () => {
    // Off the hydrated file rather than the row: the row records that a file was added and
    // nothing about what it was, so every upload logged before this would read as a photo.
    const file = (id: string, video: boolean): [{ id: string; type: 'file' }, ActivityEntity] => [
      { id, type: 'file' },
      { files: [{ bunnyStreamFk: video ? 'guid' : undefined, id } as never], name: '', row: 'none' },
    ]
    const rows = [1, 2].map((n) => upload({ createdAt: 60_000 * n, entityId: `f${n}`, id: n }))
    const mediaOf = (entries: Parameters<typeof entityMap>[0]) => card(rows, entityMap(entries)).headline.params.media

    expect(mediaOf([file('f1', true), file('f2', true)])).toBe('video')
    expect(mediaOf([file('f1', false), file('f2', false)])).toBe('photo')
    expect(mediaOf([file('f1', true), file('f2', false)])).toBe('none')
    expect(mediaOf([])).toBe('none')
  })

  it('takes a removal s word off the row, since the file it named is gone', () => {
    const removal = (oldValue: string | undefined) =>
      card([activity({ columnName: 'file', entityId: '9', entityType: 'ascent', oldValue, type: 'deleted' })]).headline
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
    const view = card([upload({ entityId: 'f1', id: 1 })], entities)

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
      ...Array.from({ length: 3 }, (_, index): [{ id: string; type: 'file' }, ActivityEntity] => [
        { id: `f${index}`, type: 'file' },
        { files: [{ id: `f${index}` } as never], name: 'Nordblock', row: 'none' },
      ]),
    ])
    const view = card(
      Array.from({ length: 3 }, (_, index) => upload({ entityId: `f${index}`, id: index + 1 })),
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
    const removed = card(
      [activity({ columnName: 'role', entityId: '5', entityType: 'user', type: 'deleted' })],
      entities,
    )
    const left = card(
      [activity({ columnName: 'membership', entityId: '5', entityType: 'user', type: 'deleted' })],
      entities,
    )

    expect(removed.rows).toEqual([])
    expect(removed.entityName).toBe('Mara Lindqvist')
    expect(left.rows).toEqual([])
  })
})

describe('changes', () => {
  it('keeps only the columns the field registry knows', () => {
    const rows = [
      activity({ columnName: 'gradeFk', createdAt: 2, id: 1 }),
      activity({ columnName: 'somethingNobodyWrites', createdAt: 1, id: 2 }),
    ]

    expect(card(rows).changes.map((change) => change.activity.columnName)).toEqual(['gradeFk'])
  })

  it('has none for a create row, which changed no column', () => {
    expect(card([activity({ type: 'created' })]).changes).toEqual([])
  })
})
