import { toRouteAscent, type RouteAscentRow } from '$lib/entities/ascent/mapper'
import { toUserFavoriteEntity, type UserAllFavoriteRow } from '$lib/entities/favorite/mapper'
import { toGrade, type GradeRow } from '$lib/entities/grade/mapper'
import { toRegionMembership, type RegionMemberRow } from '$lib/entities/region/mapper'
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
