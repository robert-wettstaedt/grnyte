/**
 * @vitest-environment node
 */

import { sub } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = vi.hoisted(() => ({
  query: {
    ascents: { findMany: vi.fn().mockResolvedValue([]) },
    files: { findMany: vi.fn().mockResolvedValue([]) },
    users: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

const mockFunctions = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getGradeTemplateString: vi.fn((gradeFk: number) => `{grade: ${gradeFk}}`),
  getVideoThumbnailUrl: vi.fn(({ videoId }: { videoId: string }) => `https://test.bunny.net/${videoId}/thumbnail.jpg`),
  getParentWith: vi.fn(),
  getQuery: vi.fn(),
  getWhere: vi.fn(),
  postProcessEntity: vi.fn(),
}))

vi.mock('$env/static/public', () => ({
  PUBLIC_BUNNY_STREAM_HOSTNAME: 'test.bunny.net',
}))

vi.mock('$lib/db/db.server', () => ({
  db: mockDb,
}))

vi.mock('$lib/config', () => ({
  config: {
    routes: {
      defaultName: 'Unnamed Route',
    },
  },
}))

vi.mock('$lib/notifications/notifications.server', () => ({
  getGradeTemplateString: mockFunctions.getGradeTemplateString,
}))

vi.mock('$lib/bunny', () => ({
  getVideoThumbnailUrl: mockFunctions.getVideoThumbnailUrl,
}))

vi.mock('$lib/components/ActivityFeed/load.server', () => ({
  getParentWith: mockFunctions.getParentWith,
  getQuery: mockFunctions.getQuery,
  getWhere: mockFunctions.getWhere,
  postProcessEntity: mockFunctions.postProcessEntity,
}))

import type * as schema from '$lib/db/schema'
import { type Group, groupActivities, createNotifications, DEBOUNCE_MINUTES } from './lib.server'

const makeActivity = (overrides: Partial<schema.Activity> = {}): schema.Activity =>
  ({
    id: 1,
    createdAt: sub(new Date(), { minutes: 10 }),
    regionFk: 1,
    type: 'created',
    userFk: 201,
    entityId: '101',
    entityType: 'ascent',
    parentEntityId: null,
    parentEntityType: null,
    columnName: null,
    metadata: null,
    oldValue: null,
    newValue: null,
    notified: null,
    ...overrides,
  }) as schema.Activity

describe('groupActivities', () => {
  it('should group ascent activities by user', () => {
    const activities = [
      makeActivity({ id: 1, userFk: 201, entityType: 'ascent', entityId: '101' }),
      makeActivity({ id: 2, userFk: 201, entityType: 'ascent', entityId: '102' }),
    ]

    const groups = groupActivities(activities)

    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('ascent')
    expect(groups[0].userFk).toBe(201)
    expect(groups[0].activities).toHaveLength(2)
  })

  it('should separate activities by user', () => {
    const activities = [
      makeActivity({ id: 1, userFk: 201, entityType: 'ascent' }),
      makeActivity({ id: 2, userFk: 301, entityType: 'ascent' }),
    ]

    const groups = groupActivities(activities)

    expect(groups).toHaveLength(2)
    expect(groups[0].userFk).not.toBe(groups[1].userFk)
  })

  it('should separate activities by type', () => {
    const activities = [
      makeActivity({ id: 1, userFk: 201, entityType: 'ascent' }),
      makeActivity({ id: 2, userFk: 201, entityType: 'user', entityId: '301' }),
    ]

    const groups = groupActivities(activities)

    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.type).sort()).toEqual(['ascent', 'user'])
  })

  it('should group non-ascent/non-user entity types as moderate', () => {
    const activities = [
      makeActivity({ id: 1, userFk: 201, entityType: 'route', type: 'updated' }),
      makeActivity({ id: 2, userFk: 201, entityType: 'block', type: 'updated' }),
    ]

    const groups = groupActivities(activities)

    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('moderate')
    expect(groups[0].activities).toHaveLength(2)
  })

  it('should filter out non-created ascent activities', () => {
    const activities = [
      makeActivity({ id: 1, entityType: 'ascent', type: 'created' }),
      makeActivity({ id: 2, entityType: 'ascent', type: 'updated' }),
      makeActivity({ id: 3, entityType: 'ascent', type: 'deleted' }),
    ]

    const groups = groupActivities(activities)

    expect(groups).toHaveLength(1)
    expect(groups[0].activities).toHaveLength(1)
    expect(groups[0].activities[0].id).toBe(1)
  })

  it('should sort activities within a group by date descending', () => {
    const activities = [
      makeActivity({ id: 1, createdAt: sub(new Date(), { minutes: 20 }) }),
      makeActivity({ id: 2, createdAt: sub(new Date(), { minutes: 10 }) }),
      makeActivity({ id: 3, createdAt: sub(new Date(), { minutes: 30 }) }),
    ]

    const groups = groupActivities(activities)

    expect(groups[0].activities[0].id).toBe(2)
    expect(groups[0].activities[1].id).toBe(1)
    expect(groups[0].activities[2].id).toBe(3)
  })

  it('should set the group date to the most recent activity date', () => {
    const recentDate = sub(new Date(), { minutes: 10 })
    const activities = [
      makeActivity({ id: 1, createdAt: sub(new Date(), { minutes: 20 }) }),
      makeActivity({ id: 2, createdAt: recentDate }),
    ]

    const groups = groupActivities(activities)

    expect(groups[0].date).toEqual(recentDate)
  })

  it('should filter out groups within the debounce window', () => {
    const activities = [makeActivity({ id: 1, createdAt: sub(new Date(), { minutes: DEBOUNCE_MINUTES - 1 }) })]

    const groups = groupActivities(activities)

    expect(groups).toHaveLength(0)
  })

  it('should keep groups outside the debounce window', () => {
    const activities = [makeActivity({ id: 1, createdAt: sub(new Date(), { minutes: DEBOUNCE_MINUTES + 1 }) })]

    const groups = groupActivities(activities)

    expect(groups).toHaveLength(1)
  })

  it('should return empty array for empty input', () => {
    const groups = groupActivities([])
    expect(groups).toHaveLength(0)
  })
})

describe('createNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockDb.query.ascents.findMany.mockResolvedValue([])
    mockDb.query.files.findMany.mockResolvedValue([])
    mockDb.query.users.findMany.mockResolvedValue([])
  })

  it('should return empty array for empty groups', async () => {
    const notifications = await createNotifications([])
    expect(notifications).toHaveLength(0)
  })

  describe('ascent notifications', () => {
    const makeAscentGroup = (overrides: Partial<Group> = {}): Group => ({
      activities: [makeActivity({ entityType: 'ascent', entityId: '101' })],
      date: sub(new Date(), { minutes: 10 }),
      type: 'ascent',
      userFk: 201,
      ...overrides,
    })

    it('should create an ascent notification with route name and grade', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'climber1' }])
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'flash',
          dateTime: new Date(),
          gradeFk: 15,
          route: { id: 201, name: 'Test Route', userGradeFk: 15, userRating: null, blockFk: 301 },
        },
      ])
      mockDb.query.files.findMany.mockResolvedValue([])

      const notifications = await createNotifications([makeAscentGroup()])

      expect(notifications).toHaveLength(1)
      expect(notifications[0].type).toBe('ascent')
      expect(notifications[0].body?.de).toBe('climber1 hat "Test Route" {grade: 15} geflasht')
      expect(notifications[0].body?.en).toBe('climber1 flashed "Test Route" {grade: 15}')
      expect(notifications[0].data).toEqual({ pathname: '/ascents/101' })
    })

    it('should use default name for unnamed routes', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'climber1' }])
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'send',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 201, name: '', userGradeFk: null, userRating: null, blockFk: 301 },
        },
      ])
      mockDb.query.files.findMany.mockResolvedValue([])

      const notifications = await createNotifications([makeAscentGroup()])

      expect(notifications[0].body?.de).toBe('climber1 hat Unnamed Route geschafft')
      expect(notifications[0].body?.en).toBe('climber1 sent Unnamed Route')
    })

    it('should include star rating when present', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'climber1' }])
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'flash',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 201, name: 'Route', userGradeFk: null, userRating: 3, blockFk: 301 },
        },
      ])
      mockDb.query.files.findMany.mockResolvedValue([])

      const notifications = await createNotifications([makeAscentGroup()])

      expect(notifications[0].body?.de).toBe('climber1 hat "Route" ⭐️⭐️⭐️ geflasht')
      expect(notifications[0].body?.en).toBe('climber1 flashed "Route" ⭐️⭐️⭐️')
    })

    it('should include "and climbed N more" for multiple ascents', async () => {
      const group = makeAscentGroup({
        activities: [
          makeActivity({ id: 1, entityId: '101' }),
          makeActivity({ id: 2, entityId: '102' }),
          makeActivity({ id: 3, entityId: '103' }),
        ],
      })

      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'climber1' }])
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'flash',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 201, name: 'Route 1', userGradeFk: null, userRating: null, blockFk: 301 },
        },
        {
          id: 102,
          type: 'send',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 202, name: 'Route 2', userGradeFk: null, userRating: null, blockFk: 301 },
        },
        {
          id: 103,
          type: 'attempt',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 203, name: 'Route 3', userGradeFk: null, userRating: null, blockFk: 301 },
        },
      ])
      mockDb.query.files.findMany.mockResolvedValue([])

      const notifications = await createNotifications([group])

      expect(notifications[0].body?.de).toBe('climber1 hat "Route 1" geflasht und 2 weitere Routen geklettert')
      expect(notifications[0].body?.en).toBe('climber1 flashed "Route 1" and climbed 2 more routes')
    })

    it('should use correct verb for each ascent type', async () => {
      const types = [
        { type: 'flash', de: 'geflasht', en: 'flashed' },
        { type: 'send', de: 'geschafft', en: 'sent' },
        { type: 'attempt', de: 'versucht', en: 'attempted' },
        { type: 'repeat', de: 'wiederholt', en: 'repeated' },
      ] as const

      for (const { type, de, en } of types) {
        vi.clearAllMocks()
        mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'climber1' }])
        mockDb.query.ascents.findMany.mockResolvedValue([
          {
            id: 101,
            type,
            dateTime: new Date(),
            gradeFk: null,
            route: { id: 201, name: 'Route', userGradeFk: null, userRating: null, blockFk: 301 },
          },
        ])
        mockDb.query.files.findMany.mockResolvedValue([])

        const notifications = await createNotifications([makeAscentGroup()])

        expect(notifications[0].body?.de).toBe(`climber1 hat "Route" ${de}`)
        expect(notifications[0].body?.en).toBe(`climber1 ${en} "Route"`)
      }
    })

    it('should prioritize flash over other ascent types', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'climber1' }])
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'attempt',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 201, name: 'Route A', userGradeFk: null, userRating: null, blockFk: 301 },
        },
        {
          id: 102,
          type: 'flash',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 202, name: 'Route B', userGradeFk: null, userRating: null, blockFk: 301 },
        },
      ])
      mockDb.query.files.findMany.mockResolvedValue([])

      const group = makeAscentGroup({
        activities: [makeActivity({ id: 1, entityId: '101' }), makeActivity({ id: 2, entityId: '102' })],
      })

      const notifications = await createNotifications([group])

      expect(notifications[0].body?.de).toBe('climber1 hat "Route B" geflasht und 1 weitere Route geklettert')
      expect(notifications[0].body?.en).toBe('climber1 flashed "Route B" and climbed 1 more route')
      expect(notifications[0].data).toEqual({ pathname: '/ascents/102' })
    })

    it('should filter out ascents older than 2 days', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'climber1' }])
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'flash',
          dateTime: sub(new Date(), { days: 3 }),
          gradeFk: null,
          route: { id: 201, name: 'Old Route', userGradeFk: null, userRating: null, blockFk: 301 },
        },
      ])

      const notifications = await createNotifications([makeAscentGroup()])

      expect(notifications).toHaveLength(0)
    })

    it('should include video thumbnail as icon when available', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'climber1' }])
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'flash',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 201, name: 'Route', userGradeFk: null, userRating: null, blockFk: 301 },
        },
      ])
      mockDb.query.files.findMany.mockResolvedValue([{ id: 501, ascentFk: 101, bunnyStreamFk: 'video123' }])

      const notifications = await createNotifications([makeAscentGroup()])

      expect(notifications[0].icon).toBe('https://test.bunny.net/video123/thumbnail.jpg')
    })

    it('should fall back to route files then block files', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'climber1' }])
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'flash',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 201, name: 'Route', userGradeFk: null, userRating: null, blockFk: 301 },
        },
      ])

      // First call (ascentFk) returns empty, second call (routeFk) returns empty, third call (blockFk) returns a file
      mockDb.query.files.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 502, blockFk: 301, bunnyStreamFk: 'blockvideo' }])

      const notifications = await createNotifications([makeAscentGroup()])

      expect(notifications[0].icon).toBe('https://test.bunny.net/blockvideo/thumbnail.jpg')
    })

    it('should have no icon when no files with bunny stream exist', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'climber1' }])
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'flash',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 201, name: 'Route', userGradeFk: null, userRating: null, blockFk: 301 },
        },
      ])
      mockDb.query.files.findMany.mockResolvedValue([{ id: 501, ascentFk: 101, bunnyStreamFk: null }])

      const notifications = await createNotifications([makeAscentGroup()])

      expect(notifications[0].icon).toBeUndefined()
    })

    it('should set the tag to userFk-type', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'climber1' }])
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'flash',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 201, name: 'Route', userGradeFk: null, userRating: null, blockFk: 301 },
        },
      ])
      mockDb.query.files.findMany.mockResolvedValue([])

      const notifications = await createNotifications([makeAscentGroup()])

      expect(notifications[0].tag).toBe('201-ascent')
    })
  })

  describe('user notifications', () => {
    const makeUserGroup = (overrides: Partial<Group> = {}): Group => ({
      activities: [makeActivity({ entityType: 'user', entityId: '401', columnName: 'role' })],
      date: sub(new Date(), { minutes: 10 }),
      type: 'user',
      userFk: 201,
      ...overrides,
    })

    it('should create a role approval notification', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'admin1' }])

      mockFunctions.getQuery.mockReturnValue({ findFirst: mockFunctions.findFirst })
      mockFunctions.findFirst.mockResolvedValue({ id: 401, username: 'newuser' })
      mockFunctions.postProcessEntity.mockResolvedValue({
        type: 'user',
        object: { id: 401, username: 'newuser' },
      })

      const notifications = await createNotifications([makeUserGroup()])

      expect(notifications).toHaveLength(1)
      expect(notifications[0].type).toBe('user')
      expect(notifications[0].body?.de).toBe('admin1 hat newuser genehmigt')
      expect(notifications[0].body?.en).toBe('admin1 approved newuser')
      expect(notifications[0].data).toEqual({ pathname: '/feed' })
    })

    it('should create an invitation notification', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'admin1' }])

      const group = makeUserGroup({
        activities: [
          makeActivity({
            entityType: 'user',
            entityId: '401',
            columnName: 'invitation',
            newValue: 'invited@example.com',
          }),
        ],
      })

      const notifications = await createNotifications([group])

      expect(notifications[0].body?.de).toBe('admin1 hat invited@example.com eingeladen')
      expect(notifications[0].body?.en).toBe('admin1 invited invited@example.com')
    })

    it('should create an accepted invitation notification', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'newuser' }])

      const group = makeUserGroup({
        activities: [
          makeActivity({
            entityType: 'user',
            entityId: '401',
            type: 'updated',
            columnName: 'invitation',
          }),
        ],
      })

      const notifications = await createNotifications([group])

      expect(notifications[0].body?.de).toBe('newuser hat die Einladung angenommen beizutreten')
      expect(notifications[0].body?.en).toBe('newuser accepted the invitation to join')
    })

    it('should create a user removal notification', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'admin1' }])

      mockFunctions.getQuery.mockReturnValue({ findFirst: mockFunctions.findFirst })
      mockFunctions.findFirst.mockResolvedValue({ id: 401, username: 'removeduser' })
      mockFunctions.postProcessEntity.mockResolvedValue({
        type: 'user',
        object: { id: 401, username: 'removeduser' },
      })

      const group = makeUserGroup({
        activities: [
          makeActivity({
            entityType: 'user',
            entityId: '401',
            type: 'deleted',
            columnName: 'role',
          }),
        ],
      })

      const notifications = await createNotifications([group])

      expect(notifications[0].body?.de).toBe('admin1 hat removeduser entfernt')
      expect(notifications[0].body?.en).toBe('admin1 removed removeduser')
    })

    it('should include "and N more" for multiple user activities', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'admin1' }])

      mockFunctions.getQuery.mockReturnValue({ findFirst: mockFunctions.findFirst })
      mockFunctions.findFirst.mockResolvedValue({ id: 401, username: 'newuser' })
      mockFunctions.postProcessEntity.mockResolvedValue({
        type: 'user',
        object: { id: 401, username: 'newuser' },
      })

      const group = makeUserGroup({
        activities: [
          makeActivity({ id: 1, entityType: 'user', entityId: '401', columnName: 'role' }),
          makeActivity({ id: 2, entityType: 'user', entityId: '402', columnName: 'role' }),
          makeActivity({ id: 3, entityType: 'user', entityId: '403', columnName: 'role' }),
        ],
      })

      const notifications = await createNotifications([group])

      expect(notifications[0].body?.de).toBe('admin1 hat newuser genehmigt und 2 weitere Updates')
      expect(notifications[0].body?.en).toBe('admin1 approved newuser and 2 more updates')
    })

    it('should return undefined when no filter matches', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 201, username: 'admin1' }])

      const group = makeUserGroup({
        activities: [
          makeActivity({
            entityType: 'user',
            entityId: '401',
            type: 'uploaded',
            columnName: 'avatar',
          }),
        ],
      })

      const notifications = await createNotifications([group])

      expect(notifications[0]).toBeUndefined()
    })
  })

  describe('moderate notifications', () => {
    const makeModerateGroup = (overrides: Partial<Group> = {}): Group => ({
      activities: [
        makeActivity({
          entityType: 'route',
          entityId: '501',
          type: 'updated',
          parentEntityId: '601',
          parentEntityType: 'block',
        }),
      ],
      date: sub(new Date(), { minutes: 10 }),
      type: 'moderate',
      userFk: 301,
      ...overrides,
    })

    it('should create a moderate notification with breadcrumb', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 301, username: 'moderator' }])

      mockFunctions.getQuery.mockReturnValue({ findFirst: mockFunctions.findFirst })
      mockFunctions.getWhere.mockReturnValue({ id: 601 })
      mockFunctions.findFirst.mockResolvedValue({ id: 601, name: 'Test Block' })
      mockFunctions.postProcessEntity.mockResolvedValue({
        type: 'block',
        breadcrumb: ['Test Area', 'Test Block'],
        object: { id: 601, name: 'Test Block' },
      })

      const notifications = await createNotifications([makeModerateGroup()])

      expect(notifications).toHaveLength(1)
      expect(notifications[0].type).toBe('moderate')
      expect(notifications[0].body?.de).toBe('moderator hat Test Area > Test Block aktualisiert')
      expect(notifications[0].body?.en).toBe('moderator updated Test Area > Test Block')
      expect(notifications[0].data).toEqual({ pathname: '/blocks/601' })
      expect(notifications[0].tag).toBe('301-moderate')
    })

    it('should use entity name when breadcrumb is empty', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 301, username: 'moderator' }])

      mockFunctions.getQuery.mockReturnValue({ findFirst: mockFunctions.findFirst })
      mockFunctions.getWhere.mockReturnValue({ id: 601 })
      mockFunctions.findFirst.mockResolvedValue({ id: 601, name: 'Direct Name' })
      mockFunctions.postProcessEntity.mockResolvedValue({
        type: 'block',
        breadcrumb: [],
        object: { id: 601, name: 'Direct Name' },
      })

      const notifications = await createNotifications([makeModerateGroup()])

      expect(notifications[0].body?.de).toBe('moderator hat Direct Name aktualisiert')
      expect(notifications[0].body?.en).toBe('moderator updated Direct Name')
    })

    it('should include "and N more" for multiple moderate activities', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 301, username: 'moderator' }])

      mockFunctions.getQuery.mockReturnValue({ findFirst: mockFunctions.findFirst })
      mockFunctions.getWhere.mockReturnValue({ id: 601 })
      mockFunctions.findFirst.mockResolvedValue({ id: 601, name: 'Test Block' })
      mockFunctions.postProcessEntity.mockResolvedValue({
        type: 'block',
        breadcrumb: ['Test Area', 'Test Block'],
        object: { id: 601, name: 'Test Block' },
      })

      const group = makeModerateGroup({
        activities: [
          makeActivity({
            id: 1,
            entityType: 'route',
            entityId: '501',
            type: 'updated',
            parentEntityId: '601',
            parentEntityType: 'block',
          }),
          makeActivity({
            id: 2,
            entityType: 'route',
            entityId: '502',
            type: 'updated',
            parentEntityId: '601',
            parentEntityType: 'block',
          }),
          makeActivity({
            id: 3,
            entityType: 'block',
            entityId: '601',
            type: 'updated',
            parentEntityId: '701',
            parentEntityType: 'area',
          }),
        ],
      })

      const notifications = await createNotifications([group])

      expect(notifications[0].body?.de).toBe('moderator hat Test Area > Test Block aktualisiert und 2 weitere Updates')
      expect(notifications[0].body?.en).toBe('moderator updated Test Area > Test Block and 2 more updates')
    })

    it('should return undefined when parentEntityId is missing', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 301, username: 'moderator' }])

      const group = makeModerateGroup({
        activities: [
          makeActivity({
            entityType: 'route',
            entityId: '501',
            type: 'updated',
            parentEntityId: null,
            parentEntityType: null,
          }),
        ],
      })

      const notifications = await createNotifications([group])

      expect(notifications).toHaveLength(0)
    })

    it('should return undefined when entity has no breadcrumb', async () => {
      mockDb.query.users.findMany.mockResolvedValue([{ id: 301, username: 'moderator' }])

      mockFunctions.getQuery.mockReturnValue({ findFirst: mockFunctions.findFirst })
      mockFunctions.getWhere.mockReturnValue({ id: 601 })
      mockFunctions.findFirst.mockResolvedValue({ id: 601, name: 'Test' })
      mockFunctions.postProcessEntity.mockResolvedValue({
        type: 'block',
        breadcrumb: null,
        object: { id: 601, name: 'Test' },
      })

      const notifications = await createNotifications([makeModerateGroup()])

      expect(notifications).toHaveLength(0)
    })
  })

  describe('multiple groups', () => {
    it('should process multiple groups and return notifications for each', async () => {
      mockDb.query.users.findMany.mockResolvedValue([
        { id: 201, username: 'climber1' },
        { id: 301, username: 'moderator' },
      ])

      // Ascent group
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'flash',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 201, name: 'Route', userGradeFk: null, userRating: null, blockFk: 301 },
        },
      ])
      mockDb.query.files.findMany.mockResolvedValue([])

      // Moderate group
      mockFunctions.getQuery.mockReturnValue({ findFirst: mockFunctions.findFirst })
      mockFunctions.getWhere.mockReturnValue({ id: 601 })
      mockFunctions.findFirst.mockResolvedValue({ id: 601, name: 'Block' })
      mockFunctions.postProcessEntity.mockResolvedValue({
        type: 'block',
        breadcrumb: ['Area', 'Block'],
        object: { id: 601, name: 'Block' },
      })

      const groups: Group[] = [
        {
          activities: [makeActivity({ entityType: 'ascent', entityId: '101' })],
          date: sub(new Date(), { minutes: 10 }),
          type: 'ascent',
          userFk: 201,
        },
        {
          activities: [
            makeActivity({
              entityType: 'route',
              entityId: '501',
              type: 'updated',
              userFk: 301,
              parentEntityId: '601',
              parentEntityType: 'block',
            }),
          ],
          date: sub(new Date(), { minutes: 10 }),
          type: 'moderate',
          userFk: 301,
        },
      ]

      const notifications = await createNotifications(groups)

      expect(notifications).toHaveLength(2)
      expect(notifications.map((n) => n.type).sort()).toEqual(['ascent', 'moderate'])
    })

    it('should use "Unknown User" when user is not found', async () => {
      mockDb.query.users.findMany.mockResolvedValue([])
      mockDb.query.ascents.findMany.mockResolvedValue([
        {
          id: 101,
          type: 'flash',
          dateTime: new Date(),
          gradeFk: null,
          route: { id: 201, name: 'Route', userGradeFk: null, userRating: null, blockFk: 301 },
        },
      ])
      mockDb.query.files.findMany.mockResolvedValue([])

      const groups: Group[] = [
        {
          activities: [makeActivity({ entityType: 'ascent', entityId: '101' })],
          date: sub(new Date(), { minutes: 10 }),
          type: 'ascent',
          userFk: 999,
        },
      ]

      const notifications = await createNotifications(groups)

      expect(notifications[0].body?.de).toBe('Jemand hat "Route" geflasht')
      expect(notifications[0].body?.en).toBe('Someone flashed "Route"')
    })
  })
})
