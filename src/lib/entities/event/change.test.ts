import { stringifyTopoChange, stringifyTopoLines, type TopoAction } from '$lib/entities/topo/change'
import type { TopoView } from '$lib/entities/topo/dto'
import { stringifyCoords } from '$lib/map/coords'
import { describe, expect, it } from 'vitest'
import { changeViews, storedMedia, type ChangeContext, type ChangeView } from './change'
import type { CardLine } from './line'
import { entityMap, line } from './line.fixture'

/**
 * What a change line says, asserted against message keys and raw values rather than against
 * copy: these are the decisions that used to live in `EventChanges.svelte`, where the only
 * way to check any of them was to look at a card.
 *
 * The cases carrying a comment are the ones the markup's own comments recorded as having been
 * wrong once.
 */

/** The one change a row decodes to. Every test here is about a single row. */
function change(partial: Partial<CardLine>, ctx?: ChangeContext): ChangeView {
  const [only] = changeViews([line(partial)], ctx)
  return only
}

/**
 * The same, asserted to be one kind and narrowed to it, for the tests that read a field only
 * that kind carries. The assertion is the point as much as the cast: a row that decodes to the
 * wrong shape fails here rather than reading `undefined` off the shape it is not.
 */
function changeOf<K extends ChangeView['kind']>(
  kind: K,
  partial: Partial<CardLine>,
  ctx?: ChangeContext,
): Extract<ChangeView, { kind: K }> {
  const view = change(partial, ctx)
  expect(view.kind).toBe(kind)
  return view as Extract<ChangeView, { kind: K }>
}

/** A photo with two lines drawn on it, the way hydration hands one over. */
function topoView(id = 700): ReadonlyMap<number, TopoView> {
  const line = (routeId: number, gradeFk: number) => ({
    gradeFk,
    id: routeId,
    name: `route ${routeId}`,
    points: [
      { id: `${routeId}-start`, type: 'start' as const, x: 0.3, y: 0.9 },
      { id: `${routeId}-top`, type: 'top' as const, x: 0.35, y: 0.1 },
    ],
    routeId,
    topType: 'top' as const,
  })

  return new Map([
    [id, { id, imageHeight: 900, imagePath: 'topo.jpg', imageWidth: 1200, lines: [line(501, 3), line(502, 18)] }],
  ])
}

const LINE = (routeFk: number, name: string, x: number) => ({
  name,
  path: `M${x},0.9 L${x + 0.05},0.2`,
  routeFk,
  topType: 'top',
})

describe('changeViews', () => {
  it('keeps only the columns the catalogue knows', () => {
    const rows = [
      line({ columnName: 'gradeFk', createdAt: 2, id: 1 }),
      line({ columnName: 'somethingNobodyWrites', createdAt: 1, id: 2 }),
    ]

    expect(changeViews(rows).map((entry) => entry.id)).toEqual(['1:gradeFk'])
  })

  it('keys a line on its column as well as its row, since one event moves several', () => {
    // An update expands to one line per column and every one of them carries the event's id, so
    // the id alone is a duplicate key: Svelte takes the whole page down to the error boundary.
    const rows = [
      line({ columnName: 'gradeFk', id: 7 }),
      line({ columnName: 'rating', id: 7 }),
      line({ columnName: 'name', id: 7 }),
    ]

    const ids = changeViews(rows).map((entry) => entry.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has none for a create row, which changed no column', () => {
    expect(changeViews([line({ verb: 'create' })])).toEqual([])
  })

  // The label reads `media` and every other label ignores it, so it has to be on every line.
  it('carries the stored media word as the label params', () => {
    expect(change({ columnName: 'file', oldValue: 'video', verb: 'remove' }).labelParams).toEqual({ media: 'video' })
    expect(change({ columnName: 'gradeFk', newValue: '11' }).labelParams).toEqual({ media: 'none' })
  })
})

describe('pair', () => {
  it('hands the values over as stored, for the markup to format', () => {
    expect(change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' })).toMatchObject({
      after: 'Kante direkt',
      before: 'Kante',
      format: 'text',
      kind: 'pair',
    })
  })

  it('declares the format its catalogue entry picked', () => {
    expect(change({ columnName: 'dateTime', newValue: '2026-04-21', objectType: 'ascent' })).toMatchObject({
      format: 'date',
      kind: 'pair',
    })
    expect(change({ columnName: 'temperature', newValue: '4', objectType: 'ascent' })).toMatchObject({
      format: 'temperature',
    })
    expect(change({ columnName: 'role', newValue: 'region_maintainer', objectType: 'user' })).toMatchObject({
      format: 'role',
    })
  })
})

describe('grade', () => {
  it('reads the stored ids', () => {
    expect(change({ columnName: 'gradeFk', newValue: '15', oldValue: '11' })).toMatchObject({
      afterFk: 15,
      beforeFk: 11,
      kind: 'grade',
    })
  })

  // A cleared grade is `null` on one row and `''` on another, and neither is a grade.
  it('has no id for a side that was cleared or never set', () => {
    expect(change({ columnName: 'gradeFk', newValue: '', oldValue: '11' })).toMatchObject({ afterFk: undefined })
    expect(change({ columnName: 'gradeFk', newValue: '11' })).toMatchObject({ beforeFk: undefined })
    expect(change({ columnName: 'gradeFk', newValue: 'not a grade' })).toMatchObject({ afterFk: undefined })
  })
})

describe('rating', () => {
  // Null coerces to zero stars rather than to "Not set": an unrated route and a route rated
  // zero are the same thing to a reader.
  it('coerces a missing side to no stars', () => {
    expect(change({ columnName: 'rating', newValue: '2' })).toMatchObject({ after: 2, before: 0, kind: 'rating' })
  })
})

describe('chips and tags', () => {
  it('splits a comma-joined column into chips', () => {
    expect(
      change({ columnName: 'firstAscensionists', newValue: 'Ada Rossi, Jonas Weber', oldValue: '' }),
    ).toMatchObject({ after: ['Ada Rossi', 'Jonas Weber'], before: [], kind: 'chips' })
  })

  it('reports tags as what the edit added and took away, not as two lists', () => {
    expect(change({ columnName: 'tags', newValue: 'SD,highball', oldValue: 'SD,traverse' })).toMatchObject({
      added: ['highball'],
      kind: 'tags',
      removed: ['traverse'],
    })
  })
})

describe('prose', () => {
  const edit = (oldValue: string | undefined, newValue: string | undefined) =>
    changeOf('prose', { columnName: 'description', newValue, oldValue })

  it('marks the words an edit changed and leaves the rest alone', () => {
    // The edit is one clause in the middle of a sentence. Rendered as two whole texts it was
    // the reader's job to find; as a diff it points at itself.
    expect(edit('The topout is easier from the left.', 'The topout is friendlier from the right.').segments).toEqual([
      { kind: 'same', value: 'The topout is ' },
      { kind: 'removed', value: 'easier' },
      { kind: 'added', value: 'friendlier' },
      { kind: 'same', value: ' from the ' },
      { kind: 'removed', value: 'left' },
      { kind: 'added', value: 'right' },
      { kind: 'same', value: '.' },
    ])
  })

  it('says nothing for a field filled from nothing or cleared', () => {
    // Both sides render as "Not set" against the text, which says more than one long stripe
    // of a single colour.
    expect(edit(undefined, 'Sit start on the flake.').segments).toBeUndefined()
    expect(edit('Sit start on the flake.', undefined).segments).toBeUndefined()
    expect(edit('', 'Sit start on the flake.').segments).toBeUndefined()
  })

  it('keeps both raw sides, which is what a one-sided edit renders', () => {
    expect(edit('Stand start.', undefined)).toMatchObject({ after: undefined, before: 'Stand start.', kind: 'prose' })
  })
})

describe('location', () => {
  const pin = (partial: Partial<CardLine>) => change({ columnName: 'location', objectType: 'block', ...partial })

  it('says a pin was set when there was none before', () => {
    expect(pin({ newValue: stringifyCoords({ lat: 47.1, long: 8.5 }) })).toMatchObject({
      approximate: false,
      captionKey: 'event_changeLocationSet',
      kind: 'location',
      metres: undefined,
    })
  })

  it('reports the distance in raw metres when the pin moved', () => {
    const moved = changeOf('location', {
      columnName: 'location',
      newValue: stringifyCoords({ lat: 47.11, long: 8.5 }),
      objectType: 'block',
      oldValue: stringifyCoords({ lat: 47.1, long: 8.5 }),
    })

    expect(moved.captionKey).toBe('event_changeLocationMoved')
    // Raw metres, because the unit belongs to whoever is reading.
    expect(Math.round(moved.metres ?? 0)).toBe(1112)
  })

  // Confirming an estimated pin rewrites the flag alone, and "Moved 0 m" would be a silly way
  // to say so.
  it('reads confirmed when the pin stayed put', () => {
    expect(
      pin({ newValue: '47.100000,8.500000', oldValue: stringifyCoords({ lat: 47.1, long: 8.5 }, true) }),
    ).toMatchObject({ captionKey: 'event_changeLocationConfirmed', metres: undefined })
  })

  it('keeps the approximate flag off the old side', () => {
    // The chip is about the pin as it stands, so an approximate pin that was confirmed drops it.
    expect(pin({ newValue: stringifyCoords({ lat: 47.1, long: 8.5 }, true) })).toMatchObject({ approximate: true })
    expect(
      pin({ newValue: '47.100000,8.500000', oldValue: stringifyCoords({ lat: 47.1, long: 8.5 }, true) }),
    ).toMatchObject({ approximate: false })
  })

  // Still true, and as vague as it always was.
  it('degrades to an update for a row written before coordinates were stored', () => {
    expect(pin({})).toMatchObject({ captionKey: 'event_changeLocationUpdated', points: [] })
  })

  it('draws the old pin as gone when the location was cleared', () => {
    expect(
      change({
        cleared: true,
        columnName: 'location',
        objectType: 'block',
        oldValue: stringifyCoords({ lat: 47.1, long: 8.5 }),
      }),
    ).toMatchObject({
      captionKey: 'event_changeLocationRemoved',
      points: [{ estimated: false, lat: 47.1, long: 8.5, variant: 'gone' }],
    })
  })

  it("draws the area's approach on a parking change, and never on one that removed it", () => {
    const paths = [
      [
        { lat: 47.1, long: 8.5 },
        { lat: 47.2, long: 8.6 },
      ],
    ]
    const entities = entityMap([
      [
        { id: '301', type: 'area' },
        { name: 'Westwand', paths, row: 'area' },
      ],
    ])
    const parking = (partial: Partial<CardLine>) =>
      change(
        { columnName: 'parking location', objectId: '301', objectType: 'area', verb: 'add', ...partial },
        { entities },
      )

    expect(parking({ newValue: '47.1,8.5' })).toMatchObject({ paths })
    // The pin is gone, so the walk to it is not worth drawing.
    expect(parking({ oldValue: '47.1,8.5', verb: 'remove' })).toMatchObject({ paths: undefined })
  })
})

describe('source', () => {
  it('credits the host and keeps the URL behind it', () => {
    expect(
      change({
        columnName: 'source',
        newValue: 'https://vimeo.com/912345',
        objectType: 'file',
        oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    ).toMatchObject({
      after: { host: 'vimeo.com', value: 'https://vimeo.com/912345' },
      before: { host: 'www.youtube.com', value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      kind: 'source',
    })
  })

  // Whatever this names becomes an href, and a script scheme can carry a plausible hostname.
  it('has no host for a value a browser must not follow', () => {
    expect(
      change({
        columnName: 'source',
        newValue: 'javascript://example.com/%0aalert(1)',
        objectType: 'file',
      }),
    ).toMatchObject({ after: { host: undefined, value: 'javascript://example.com/%0aalert(1)' } })
  })
})

describe('file', () => {
  it('reads the word off the row, since the file itself is gone', () => {
    expect(change({ columnName: 'file', oldValue: 'photo', verb: 'remove' })).toMatchObject({
      kind: 'file',
      media: 'photo',
    })
  })

  it('says media for a row written before the word was stored', () => {
    expect(change({ columnName: 'file', verb: 'remove' })).toMatchObject({ media: 'none' })
    expect(storedMedia('nonsense')).toBe('none')
  })
})

describe('topo', () => {
  const topo = (partial: Partial<CardLine>, topos?: ReadonlyMap<number, TopoView>) =>
    changeOf('topo', { columnName: 'topo', objectType: 'block', ...partial }, { topos })

  const metadata = (action: TopoAction, topoId?: number) => stringifyTopoChange({ action, topoId })

  it('names the four photo actions and lets a redraw speak through its chips', () => {
    expect(topo({ metadata: metadata('photoAdded', 700) }).captionKey).toBe('event_changeTopoPhotoAdded')
    expect(topo({ metadata: metadata('photoReplaced', 700) }).captionKey).toBe('event_changeTopoPhotoReplaced')
    expect(topo({ metadata: metadata('reordered') }).captionKey).toBe('event_changeTopoReordered')
    // The same sentence a pulled route photo gets: it is the same event to a reader.
    expect(topo({ columnName: 'topo', metadata: metadata('photoRemoved', 701), verb: 'remove' }).captionKey).toBe(
      'event_changeFileRemoved',
    )
  })

  // Still true, and as vague as it always was.
  it('degrades for a row that named no topo change', () => {
    expect(topo({})).toMatchObject({
      added: [],
      captionKey: 'event_changeTopoUpdated',
      image: undefined,
      lines: [],
    })
  })

  it('reports what a redraw drew, moved and erased', () => {
    const before = stringifyTopoLines([LINE(501, 'Kante direkt', 0.2), LINE(502, 'Rampe', 0.5)])
    const after = stringifyTopoLines([LINE(501, 'Kante direkt', 0.3), LINE(503, 'Neuland', 0.7)])

    expect(topo({ metadata: metadata('lines', 700), newValue: after, oldValue: before }, topoView())).toMatchObject({
      added: [{ name: 'Neuland', routeFk: 503 }],
      // Nothing to say in words: the chips are the story.
      captionKey: undefined,
      redrawn: [{ name: 'Kante direkt', routeFk: 501 }],
      removed: [{ name: 'Rampe', routeFk: 502 }],
    })
  })

  it('falls back to a sentence when a redraw has no chips to show', () => {
    const lines = stringifyTopoLines([LINE(501, 'Kante direkt', 0.2)])

    expect(topo({ metadata: metadata('lines', 700), newValue: lines, oldValue: lines }, topoView())).toMatchObject({
      captionKey: 'event_changeTopoLinesUpdated',
    })
  })

  // The ghost of a redrawn line sits directly under the live one for the same route, so the
  // two must not share an id: they did, and the erased line looked like it drew nothing.
  it('negates a ghost id so it cannot collide with the live line', () => {
    const before = stringifyTopoLines([LINE(501, 'Kante direkt', 0.2)])
    const after = stringifyTopoLines([LINE(501, 'Kante direkt', 0.4)])
    const redraw = topo({ metadata: metadata('lines', 700), newValue: after, oldValue: before }, topoView())

    expect(redraw.lines.map((line) => [line.id, line.ghost])).toEqual([
      [-501, true],
      [501, false],
    ])
  })

  it('colours a live line off the photo and leaves a ghost neutral', () => {
    const before = stringifyTopoLines([LINE(502, 'Rampe', 0.2)])
    const after = stringifyTopoLines([LINE(502, 'Rampe', 0.4)])
    const redraw = topo({ metadata: metadata('lines', 700), newValue: after, oldValue: before }, topoView())

    // Route 502 is graded 18 on the photo, which is the hard band; the ghost is a ghost anyway.
    expect(redraw.lines.map((line) => line.band)).toEqual([undefined, 4])
  })

  it('draws the photo as it stands for an action that changed the photo', () => {
    const added = topo({ metadata: metadata('photoAdded', 700) }, topoView())

    expect(added.image).toEqual({ height: 900, path: 'topo.jpg', width: 1200 })
    expect(added.lines.map((line) => [line.id, line.band])).toEqual([
      [501, 2],
      [502, 4],
    ])
  })

  // A photo the metadata names but nothing resolves: the sentence stands, with no image.
  it('draws nothing when the photo it names has not hydrated', () => {
    expect(topo({ metadata: metadata('photoAdded', 999) }, topoView())).toMatchObject({ image: undefined, lines: [] })
  })

  it('drops a line whose stored path does not decode', () => {
    const after = stringifyTopoLines([{ name: 'Kante direkt', path: '   ', routeFk: 501, topType: 'top' }])
    const redraw = topo({ metadata: metadata('lines', 700), newValue: after, oldValue: '' }, topoView())

    // Still named by a chip: the edit happened, it just cannot be drawn.
    expect(redraw).toMatchObject({ added: [{ name: 'Kante direkt', routeFk: 501 }], lines: [] })
  })
})
