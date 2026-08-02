import type { UserAscentDetail } from '$lib/entities/ascent/dto'
import type { MediaFile } from '$lib/entities/file/dto'
import type { RouteListItem } from '$lib/entities/route/dto'
import { describe, expect, it } from 'vitest'
import type { ActivityEntityType } from './dto'
import { activityEntityKey, type ActivityEntityRef } from './entity'
import { activityEntityMap, type ActivityHydration } from './hydrate.svelte'

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

function hydration(input: Partial<ActivityHydration> & Pick<ActivityHydration, 'refs'>): ActivityHydration {
  return {
    areas: [],
    ascents: [],
    blocks: [],
    files: [],
    ready: new Set<ActivityEntityType>(),
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

function ref(type: ActivityEntityType, id: string): ActivityEntityRef {
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

const get = (map: ReturnType<typeof activityEntityMap>, type: ActivityEntityType, id: string) =>
  map.get(activityEntityKey(ref(type, id)))

describe('activityEntityMap', () => {
  it('leaves an unanswered ref out (skeleton) and nulls one its answered fetch missed (tombstone)', () => {
    const refs = [ref('route', '500'), ref('area', '300')]

    const pending = activityEntityMap(hydration({ refs }))
    expect(pending.has(activityEntityKey(refs[0]))).toBe(false)

    const answered = activityEntityMap(hydration({ ready: new Set(['area', 'route']), refs }))
    expect(get(answered, 'route', '500')).toBeNull()
    expect(get(answered, 'area', '300')).toBeNull()
  })

  it('renders an ascent as its route row, carrying the climber, the media and the notes', () => {
    const map = activityEntityMap(
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

    expect(activityEntityMap(hydration({ ...input, ready: new Set(['ascent']) })).size).toBe(0)
    // Routes answered without it: the route is gone, so the card names it and drops the row.
    expect(
      get(activityEntityMap(hydration({ ...input, ready: new Set(['ascent', 'route']) })), 'ascent', '9001'),
    ).toMatchObject({
      name: 'Rampe',
      row: 'none',
    })
  })

  it('gives an upload its photo and no row of its own', () => {
    const map = activityEntityMap(
      hydration({ files: [photo('up-1')], ready: new Set(['file']), refs: [ref('file', 'up-1')] }),
    )

    expect(get(map, 'file', 'up-1')).toEqual({ files: [photo('up-1')], name: '', row: 'none' })
  })

  it('drops the region crumb for a single-region user and keeps the area and block ones', () => {
    const map = activityEntityMap(
      hydration({
        ready: new Set(['route']),
        refs: [ref('route', '500')],
        routes: [{ ...route(500, 'Rampe'), areaName: 'Westwand', blockName: 'Nordblock' }],
        userRegions: [{ name: 'Saxony', regionFk: 1, role: 'region_user', settings: undefined }],
      }),
    )

    expect(get(map, 'route', '500')?.crumbs).toEqual(['Westwand', 'Nordblock'])
  })
})
