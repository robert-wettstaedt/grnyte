import { toAreaDetail } from '$lib/entities/area/mapper'
import { toAreaRow } from '$lib/entities/area/resources.svelte'
import { toRouteAscent, type RouteAscentRow } from '$lib/entities/ascent/mapper'
import { toBlockDetail } from '$lib/entities/block/mapper'
import { toBlockRow } from '$lib/entities/block/resources.svelte'
import { toUserFavoriteEntity, type UserAllFavoriteRow } from '$lib/entities/favorite/mapper'
import { toGrade, type GradeRow } from '$lib/entities/grade/mapper'
import { toRegionMembership, type RegionMemberRow } from '$lib/entities/region/mapper'
import { toRouteDetail } from '$lib/entities/route/mapper'
import { toRouteRow } from '$lib/entities/route/resources.svelte'
import { toTopoViews } from '$lib/entities/topo/mapper'
import { toUser, toUserListItem, type CurrentUserRow, type UserListRow } from '$lib/entities/user/mapper'
import { describe, expect, it } from 'vitest'
import { toZeroRow } from './rows'

// S7: a row as PowerSync stores it, reshaped, must reach the mappers exactly as Zero's row of the same data does.
const LAYER = { name: 'Bayern Relief', type: 'wms', url: 'https://example.test/wms' }

describe('toZeroRow', () => {
  it('hands the grade mapper the integer id, not PowerSync text id', () => {
    const synced = { FB: '5a', id: '1', ircra: 10, nid: 1, V: 'V2' }

    expect(toGrade(toZeroRow<GradeRow>('grades', synced))).toEqual({ FB: '5a', id: 1, V: 'V2' })
  })

  it('turns microsecond timestamps into epoch ms and 0/1 into booleans', () => {
    const synced = {
      auth_user_fk: 'a1',
      created_at: '2026-11-07T10:00:00.123456Z',
      id: '7',
      invited_by: null,
      is_active: 1,
      nid: 7,
      region_fk: 4,
      role: 'region_admin',
      user_fk: 3,
    }

    expect(toZeroRow('region_members', synced)).toEqual({
      authUserFk: 'a1',
      createdAt: 1794045600123,
      id: 7,
      invitedByFk: null,
      isActive: true,
      regionFk: 4,
      role: 'region_admin',
      userFk: 3,
    })
  })

  it('keeps a switched-off notification off, rather than falling back to the default on', () => {
    const settings = toZeroRow<CurrentUserRow['userSettings']>('user_settings', {
      grading_scale: 'V',
      id: '5',
      nid: 5,
      notify_ascents: 0,
      notify_comments: 1,
      unit_system: 'imperial',
    })
    const user = toUser({
      ...toZeroRow<CurrentUserRow>('users', { id: '3', nid: 3, username: 'ada' }),
      userSettings: settings,
    })

    expect(user).toMatchObject({ id: 3, username: 'ada' })
    expect(user.userSettings).toMatchObject({
      gradingScale: 'V',
      notifyAscents: false,
      notifyComments: true,
      unitSystem: 'imperial',
    })
  })

  it('labels a listed member with the regions its memberships name', () => {
    const user = toUserListItem({
      ...toZeroRow<UserListRow>('users', { id: '4', nid: 4, username: 'jürgen' }),
      regionMemberships: [2, 18].map((region) =>
        toZeroRow<UserListRow['regionMemberships'][number]>('region_members', {
          is_active: 1,
          nid: region * 10,
          region_fk: region,
        }),
      ),
    })

    expect(user).toEqual({ id: 4, regionFks: [2, 18], username: 'jürgen' })
  })

  it("reads an ascent's date, author and video as a route's ascent list shows them", () => {
    type File = RouteAscentRow['files'][number]
    const ascent = toRouteAscent({
      ...toZeroRow<RouteAscentRow>('ascents', {
        created_by: 3,
        date_time: '2026-11-07T10:00:00.123456+00:00',
        id: '9',
        nid: 9,
        region_fk: 18,
        route_fk: 125,
        type: 'flash',
      }),
      author: toZeroRow<RouteAscentRow['author']>('users', { id: '3', nid: 3, username: 'ada' }),
      files: [
        {
          ...toZeroRow<File>('files', {
            ascent_fk: 9,
            bunny_stream_fk: 's1',
            created_by: 3,
            id: 'ck1',
            path: 'v/1',
            region_fk: 18,
          }),
          author: toZeroRow<File['author']>('users', { id: '3', nid: 3, username: 'ada' }),
          bunnyStream: toZeroRow<File['bunnyStream']>('bunny_streams', {
            id: 's1',
            readiness: 'ready',
            source: 'hls/1',
          }),
        },
      ],
    })

    expect(ascent).toMatchObject({ authorName: 'ada', dateTime: 1794045600123, id: 9, type: 'flash' })
    expect(ascent.files[0]).toMatchObject({ id: 'ck1', readiness: 'ready', source: 'hls/1' })
  })

  it('names a favorite by the one key it carries', () => {
    const row = { area_fk: null, block_fk: 12, created_at: '2026-11-07T10:00:00Z', id: '8', nid: 8, route_fk: null }

    expect(toUserFavoriteEntity(toZeroRow<UserAllFavoriteRow>('favorites', row))).toEqual({
      entityId: 12,
      entityType: 'block',
    })
  })

  it("reads a block's breadcrumb, pin, grade counts and topo lines as the block page shows them", () => {
    const synced = {
      area: [{ id: 5, name: 'Sector', parent: [{ id: 2, name: 'Forest', parent: [], type: 'area' }], type: 'sector' }],
      area_fk: 5,
      created_at: '2026-11-07T10:00:00.123456Z',
      created_by: 3,
      description: null,
      geolocation: [{ estimated: 1, id: '6', lat: 47.5, long: 11.1, nid: 6 }],
      grade_counts: JSON.stringify({ '12': 2, none: 1 }),
      id: '40',
      name: '',
      nid: 40,
      order: 2,
      region_fk: 18,
      routes: [{ id: '125', name: 'Kante', nid: 125, region_fk: 18, tags: [{ tag_fk: 'crimpy' }], user_grade_fk: 12 }],
      topos: [
        {
          file: [{ created_by: 3, height: 800, id: 'f1', path: 't/1', width: 600 }],
          id: '9',
          lines: [{ id: '30', nid: 30, path: 'M0.1,0.9 L0.2,0.1 Z', route_fk: 125, top_type: 'topout' }],
          nid: 9,
        },
      ],
    }
    const row = toBlockRow(synced)

    expect(toBlockDetail(row)).toMatchObject({
      areas: [
        { id: 2, name: 'Forest' },
        { id: 5, name: 'Sector', type: 'sector' },
      ],
      createdAt: new Date(1794045600123),
      description: '',
      geolocation: { estimated: true, id: 6, lat: 47.5, long: 11.1 },
      gradeCounts: new Map([[12, 2]]),
      id: 40,
      name: 'Block 3',
      routeCount: 3,
      topoImages: [{ height: 800, id: 9, path: 't/1', width: 600 }],
    })
    expect(row.routes[0]).toMatchObject({ id: 125, tags: [{ tagFk: 'crimpy' }], userGradeFk: 12 })
    expect(toTopoViews(row)[0]?.lines).toMatchObject([{ gradeFk: 12, id: 30, name: 'Kante', routeId: 125 }])
  })

  it("reads an area's breadcrumb, parking and geo paths as the area page shows them", () => {
    const area = toAreaDetail(
      toAreaRow({
        created_at: '2026-11-07T10:00:00.123456Z',
        description: null,
        geo_paths: JSON.stringify(['M1,2']),
        id: '5',
        name: 'Sector',
        nid: 5,
        parent: [{ id: 2, name: 'Forest', parent: [{ id: 1, name: '', parent: [], type: 'area' }], type: 'area' }],
        parent_fk: 2,
        parking: [{ area_fk: 5, estimated: 0, id: '6', lat: 47.5, long: 11.1, nid: 6 }],
        region_fk: 18,
        type: 'sector',
      } as Parameters<typeof toAreaRow>[0]),
    )

    expect(area).toMatchObject({
      areas: [
        { id: 1, name: 'Unnamed' },
        { id: 2, name: 'Forest', type: 'area' },
      ],
      createdAt: new Date(1794045600123),
      description: '',
      geoPaths: ['M1,2'],
      id: 5,
      parentFk: 2,
      parkingLocations: [{ estimated: false, id: 6, lat: 47.5, long: 11.1 }],
      regionFk: 18,
      type: 'sector',
    })
  })

  it("reads a route's tags, first ascents, block and topo thumb as the route page shows them", () => {
    const route = toRouteDetail(
      toRouteRow({
        area_ids: '^2$,^5$',
        block: JSON.stringify({ area: { name: 'Sector' }, name: '', order: 2 }),
        block_fk: 40,
        created_at: '2026-11-07T10:00:00.123456Z',
        created_by: 3,
        description: null,
        first_ascent_year: 1998,
        first_ascents: JSON.stringify([
          { firstAscensionist: { name: 'Ada', userFk: 3 } },
          { firstAscensionist: { name: 'Bea', userFk: null } },
          { firstAscensionist: null },
        ]),
        grade_fk: 11,
        id: '125',
        name: 'Kante',
        nid: 125,
        rating: null,
        region_fk: 18,
        tags: JSON.stringify([{ tagFk: 'crimpy' }, { tagFk: 'roof' }]),
        topo_routes: JSON.stringify([
          { path: 'M0.1,0.9 L0.2,0.1', topo: { file: { height: 800, path: 't/1', width: 600 } } },
          { path: null, topo: null },
        ]),
        user_grade_fk: 12,
        user_rating: 2,
      }),
    )

    expect(route).toMatchObject({
      areaName: 'Sector',
      blockFk: 40,
      blockName: 'Block 3',
      createdAt: new Date(1794045600123),
      description: '',
      firstAscents: [{ name: 'Ada', userFk: 3 }, { name: 'Bea' }],
      firstAscentYear: 1998,
      gradeFk: 12,
      id: 125,
      name: 'Kante',
      rating: 2,
      rawGradeFk: 11,
      rawRating: 0,
      regionFk: 18,
      tags: ['crimpy', 'roof'],
      topoImageHeight: 800,
      topoImagePath: 't/1',
      topoLines: 2,
    })
    expect(route.firstAscents[1]?.userFk).toBeUndefined()
  })

  it('parses jsonb text, so region settings read whole', () => {
    const region = toZeroRow('regions', {
      created_at: '2026-01-01T00:00:00Z',
      created_by: 'a1',
      id: '4',
      max_members: 10,
      name: 'North Forest',
      nid: 4,
      settings: JSON.stringify({ mapLayers: [LAYER] }),
    })
    const membership = toRegionMembership({ region, regionFk: 4, role: 'region_admin' } as RegionMemberRow)

    expect(membership.layersComplete).toBe(true)
    expect(membership.settings.mapLayers).toEqual([LAYER])
  })
})
