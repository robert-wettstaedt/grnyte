import type { UserAscentDetail } from '$lib/entities/ascent/dto'
import type { MediaFile } from '$lib/entities/file/dto'
import type { RouteListItem } from '$lib/entities/route/dto'
import { describe, expect, it } from 'vitest'
import type { EventObjectType } from './dto'
import { eventEntityKey, type EventEntityRef } from './entity'
import { eventEntityMap, type EntityHydration } from './hydrate.svelte'

function ascent(id: number, routeFk: number, extra: Partial<UserAscentDetail> = {}): UserAscentDetail {
  return {
    authorName: 'Sofia',
    createdBy: 7,
    dateTime: undefined,
    files: [],
    gradeFk: undefined,
    humidity: undefined,
    id,
    notes: 'Second try.',
    rating: undefined,
    regionFk: 1,
    routeFk,
    routeGradeFk: 12,
    routeName: 'Rampe',
    temperature: undefined,
    type: 'redpoint',
    ...extra,
  }
}

function hydration(input: Partial<EntityHydration> & Pick<EntityHydration, 'refs'>): EntityHydration {
  return {
    areas: [],
    ascents: [],
    blocks: [],
    files: [],
    ready: new Set<EventObjectType>(),
    routes: [],
    userRegions: [],
    users: [],
    ...input,
  }
}

function photo(id: string): MediaFile {
  return {
    ascentCreatedBy: undefined,
    bunnyStreamFk: undefined,
    createdAt: 0,
    height: 900,
    id,
    path: `${id}.jpg`,
    regionFk: 1,
    source: undefined,
    uploader: undefined,
    visibility: 'public',
    width: 1200,
  }
}

function ref(type: EventObjectType, id: string): EventEntityRef {
  return { id, type }
}

function route(id: number, name: string): RouteListItem {
  return {
    blockFk: 400,
    createdAt: undefined,
    createdBy: 1,
    description: '',
    firstAscentYear: undefined,
    gradeFk: 12,
    id,
    name,
    rating: 3,
    regionFk: 1,
    tags: ['SD'],
  }
}

const get = (map: ReturnType<typeof eventEntityMap>, type: EventObjectType, id: string) =>
  map.get(eventEntityKey(ref(type, id)))

describe('eventEntityMap', () => {
  it('leaves an unanswered ref out (skeleton) and nulls one its answered fetch missed (tombstone)', () => {
    const refs = [ref('route', '500'), ref('area', '300')]

    const pending = eventEntityMap(hydration({ refs }))
    expect(pending.has(eventEntityKey(refs[0]))).toBe(false)

    const answered = eventEntityMap(hydration({ ready: new Set(['area', 'route']), refs }))
    expect(get(answered, 'route', '500')).toBeNull()
    expect(get(answered, 'area', '300')).toBeNull()
  })

  it('renders an ascent as its route row, carrying the climber, the media and the notes', () => {
    const map = eventEntityMap(
      hydration({
        ascents: [ascent(9001, 500, { files: [photo('f1')] })],
        ready: new Set(['ascent', 'route']),
        refs: [ref('ascent', '9001')],
        routes: [route(500, 'Rampe')],
      }),
    )

    expect(get(map, 'ascent', '9001')).toMatchObject({
      ascentType: 'redpoint',
      climberFk: 7,
      climberName: 'Sofia',
      files: [{ id: 'f1' }],
      name: 'Rampe',
      note: 'Second try.',
      // The route's own values, not zeroes read off the ascent.
      route: { rating: 3, tags: ['SD'] },
      row: 'route',
    })
  })

  it('holds an ascent back while its route is still in flight, since the routes are a second wave', () => {
    const input = { ascents: [ascent(9001, 500)], refs: [ref('ascent', '9001')] }

    expect(eventEntityMap(hydration({ ...input, ready: new Set(['ascent']) })).size).toBe(0)
    // Routes answered without it: the route is gone, so the card names it and drops the row.
    expect(
      get(eventEntityMap(hydration({ ...input, ready: new Set(['ascent', 'route']) })), 'ascent', '9001'),
    ).toMatchObject({
      name: 'Rampe',
      row: 'none',
    })
  })

  it('gives an upload its photo and no row of its own', () => {
    const map = eventEntityMap(
      hydration({ files: [photo('up-1')], ready: new Set(['file']), refs: [ref('file', 'up-1')] }),
    )

    expect(get(map, 'file', 'up-1')).toEqual({ files: [photo('up-1')], name: '', row: 'none' })
  })

  it('drops the region crumb for a single-region user and keeps the area and block ones', () => {
    const map = eventEntityMap(
      hydration({
        ready: new Set(['route']),
        refs: [ref('route', '500')],
        routes: [{ ...route(500, 'Rampe'), areaName: 'Westwand', blockName: 'Nordblock' }],
        userRegions: [{ name: 'Saxony', regionFk: 1, role: 'region_user', settings: undefined }],
      }),
    )

    expect(get(map, 'route', '500')?.crumbs).toEqual(['Westwand', 'Nordblock'])
  })

  /**
   * The readiness rule, which is what the flashing tombstones were. A kind declares what it
   * waits for (`KINDS[kind].needs`) and this is the behaviour that declaration buys, asserted
   * per kind rather than for the one that happens to have a dependency today.
   */
  describe('readiness', () => {
    it.each([
      ['area', '300'],
      ['block', '400'],
      ['file', 'f-1'],
      ['route', '500'],
      ['user', '5'],
    ] as const)('leaves a %s ref pending until its own fetch answers', (type, id) => {
      const refs = [ref(type, id)]

      expect(eventEntityMap(hydration({ refs })).size).toBe(0)
      expect(get(eventEntityMap(hydration({ ready: new Set([type]), refs })), type, id)).toBeNull()
    })

    // An ascent's row is its route's, so its own fetch answering is not enough.
    it('holds an ascent pending until the routes answer too', () => {
      const refs = [ref('ascent', '9001')]

      expect(eventEntityMap(hydration({ ready: new Set(['ascent']), refs })).size).toBe(0)
      expect(get(eventEntityMap(hydration({ ready: new Set(['ascent', 'route']), refs })), 'ascent', '9001')).toBeNull()
    })

    // A kind that answered says nothing about a ref of another kind.
    it('decides each ref against its own kind', () => {
      const map = eventEntityMap(
        hydration({ ready: new Set(['area']), refs: [ref('area', '300'), ref('block', '400')] }),
      )

      expect(get(map, 'area', '300')).toBeNull()
      expect(map.has(eventEntityKey(ref('block', '400')))).toBe(false)
    })
  })
})
