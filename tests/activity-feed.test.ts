import { REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '$lib/auth'
import type { ActivityDTO, Entity } from '$lib/components/ActivityFeed'
import {
  createUpdateActivity,
  groupActivities,
  insertActivity,
  loadFeed,
} from '$lib/components/ActivityFeed/load.server'
import { config } from '$lib/config'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import type { User as AuthUser, SupabaseClient } from '@supabase/supabase-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock external dependencies
vi.mock('$lib/db/db.server', () => ({
  createDrizzleSupabaseClient: vi.fn(),
}))

vi.mock('$lib/markdown', () => ({
  convertMarkdownToHtml: vi.fn((text) => Promise.resolve(`<p>${text}</p>`)),
}))

vi.mock('$lib/config', () => ({
  config: {
    cache: {
      keys: {
        activityFeed: 'activity_feed',
      },
      ttl: 1000 * 60 * 60, // 1 hour default TTL
    },
    activityFeed: {
      groupTimeLimit: 3 * 60 * 60 * 1000, // 3 hours in milliseconds
    },
  },
}))

vi.mock('$lib/cache/cache.server', () => ({
  getFromCache: vi.fn(),
  setInCache: vi.fn(),
  invalidateCache: vi.fn(),
  getFromCacheWithDefault: vi.fn((cache, userRegions, fn, defaultFn, defaultValue) => fn()),
  getCacheKey: vi.fn((userRegions: App.Locals['userRegions']) => userRegions.map((r) => r.regionFk).join('-')),
  getCacheHashKey: vi.fn(
    (userRegions: App.Locals['userRegions']) => `${userRegions.map((r) => r.regionFk).join('-')}_hash`,
  ),
  getCacheHash: vi.fn((cache, userRegions) => Promise.resolve(undefined)),
  caches: {
    activityFeed: {
      clear: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    },
  },
}))

interface FileWithPath {
  path: string
  [key: string]: unknown
}

vi.mock('$lib/nextcloud/nextcloud.server', () => ({
  loadFiles: vi.fn((files: FileWithPath[]) =>
    Promise.resolve(
      files.map((file) => ({
        ...file,
        stat: {
          filename: file.path,
          basename: file.path.split('/').pop(),
          lastmod: new Date().toISOString(),
          size: 1024,
          type: 'file',
        },
      })),
    ),
  ),
}))

// Mock data
const mockArea = {
  id: 1,
  name: 'Test Area',
  description: 'Test Description',
  parentFk: null,
  parent: null,
}

const mockBlock = {
  id: 1,
  name: 'Test Block',
  area: mockArea,
}

const mockRoute = {
  id: 1,
  name: 'Test Route',
  description: 'Test Description',
  block: mockBlock,
}

const mockAscent = {
  id: 1,
  notes: 'Test Notes',
  files: [{ id: 1, path: '/test/image.jpg' }],
  author: { id: 1, name: 'Test User' },
}

const mockActivity = {
  id: 1,
  type: 'created',
  entityType: 'ascent',
  entityId: '1',
  userFk: 1,
  createdAt: new Date(),
  parentEntityId: null,
  parentEntityType: null,
  columnName: null,
  oldValue: null,
  newValue: null,
  metadata: null,
  notified: null,
  regionFk: 1,
} satisfies schema.Activity

const mockRegion = {
  createdAt: new Date(),
  id: 1,
  name: 'Test Region',
  settings: {
    mapLayers: [],
  },
} satisfies schema.Region

const mockSupabase = {
  supabaseUrl: 'http://localhost:54321',
  supabaseKey: 'test-key',
  auth: {},
  realtime: {},
  from: () => ({}),
  rpc: () => ({}),
  storage: () => ({}),
  channel: () => ({}),
  rest: {},
  graphql: {},
  functions: {},
} as unknown as SupabaseClient

const mockSupabaseUser = {
  id: 'auth0|123',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  role: 'authenticated',
  email: 'test@example.com',
} as AuthUser

const mockSchemaUser = {
  id: 1,
  username: 'testuser',
  authUserFk: mockSupabaseUser.id,
  firstAscensionistFk: null,
  userSettingsFk: null,
  createdAt: new Date(),
  userSettings: {
    gradingScale: 'FB',
    notifyModerations: false,
    notifyNewAscents: false,
    notifyNewUsers: false,
  },
} satisfies App.SafeSession['user']

const mockLocals = {
  supabase: mockSupabase,
  safeGetSession: async () => ({
    session: undefined,
    user: mockSchemaUser,
    userPermissions: [REGION_PERMISSION_READ, REGION_PERMISSION_EDIT],
    userRole: 'anonymous',
    userRegions: [],
  }),
  session: undefined,
  user: mockSchemaUser,
  userPermissions: [REGION_PERMISSION_READ, REGION_PERMISSION_EDIT],
  userRegions: [],
  userRole: 'anonymous',
} satisfies App.Locals

type MockDb = {
  query: {
    activities: {
      findMany: ReturnType<typeof vi.fn>
    }
    areas: {
      findFirst: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
    }
    blocks: {
      findFirst: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
    }
    routes: {
      findFirst: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
    }
    ascents: {
      findFirst: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
    }
    users: {
      findFirst: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
    }
    files: {
      findFirst: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
    }
    regions: {
      findFirst: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
    }
  }
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

describe('Activity Feed', () => {
  let mockDb: MockDb

  beforeEach(() => {
    const whereMock = {
      where: vi.fn().mockReturnValue([{ count: 10 }]),
    }

    const fromMock = {
      from: vi.fn().mockReturnValue(whereMock),
    }

    mockDb = {
      query: {
        activities: {
          findMany: vi.fn().mockResolvedValue([{ ...mockActivity, user: mockSchemaUser }]),
        },
        areas: {
          findFirst: vi.fn().mockResolvedValue(mockArea),
          findMany: vi.fn().mockResolvedValue([mockArea]),
        },
        blocks: {
          findFirst: vi.fn().mockResolvedValue(mockBlock),
          findMany: vi.fn().mockResolvedValue([mockBlock]),
        },
        routes: {
          findFirst: vi.fn().mockResolvedValue(mockRoute),
          findMany: vi.fn().mockResolvedValue([mockRoute]),
        },
        ascents: {
          findFirst: vi.fn().mockResolvedValue(mockAscent),
          findMany: vi.fn().mockResolvedValue([mockAscent]),
        },
        users: {
          findFirst: vi.fn().mockResolvedValue({ ...mockSchemaUser, userSettings: { gradingScale: 'FB' } }),
          findMany: vi.fn().mockResolvedValue([{ ...mockSchemaUser, userSettings: { gradingScale: 'FB' } }]),
        },
        files: {
          findFirst: vi.fn().mockResolvedValue({ id: 1, path: '/test/image.jpg' }),
          findMany: vi.fn().mockResolvedValue([{ id: 1, path: '/test/image.jpg' }]),
        },
        regions: {
          findFirst: vi.fn().mockResolvedValue(mockRegion),
          findMany: vi.fn().mockResolvedValue([mockRegion]),
        },
      },
      select: vi.fn().mockReturnValue(fromMock),
      insert: vi.fn().mockReturnValue({ values: vi.fn() }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
    }

    const dbWithTransaction = async <T>(fn: (tx: any) => Promise<T>) => fn(mockDb as any)
    vi.mocked(createDrizzleSupabaseClient).mockResolvedValue(dbWithTransaction)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('loadFeed', () => {
    it('should load activities with pagination', async () => {
      const result = await loadFeed({
        locals: mockLocals,
        url: new URL('http://localhost:3000/feed?page=1&pageSize=10'),
      })

      expect(result.activities).toHaveLength(1)
      expect(result.activities[0].items).toHaveLength(1)
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 10,
        total: 10,
        totalPages: 1,
      })
    })

    it('should filter activities by type', async () => {
      await loadFeed({
        locals: mockLocals,
        url: new URL('http://localhost:3000/feed?type=ascents'),
      })

      expect(mockDb.query.activities.findMany).toHaveBeenCalled()
      const findManyCall = vi.mocked(mockDb.query.activities.findMany).mock.calls[0][0]
      expect(findManyCall).toHaveProperty('where')
    })

    it('should process different entity types correctly', async () => {
      // Test area activity
      vi.mocked(mockDb.query.activities.findMany).mockResolvedValueOnce([
        { ...mockActivity, entityType: 'area', entityId: '1', user: { id: 1, name: 'Test User' } },
      ])

      // Mock the findMany for area entities
      vi.mocked(mockDb.query.areas.findMany).mockResolvedValueOnce([mockArea])

      const areaResult = await loadFeed({
        locals: mockLocals,
        url: new URL('http://localhost:3000/feed'),
      })

      expect(areaResult.activities[0].items[0].entityType).toBe('area')
      expect(areaResult.activities[0].entity.type).toBe('area')

      // Test route activity
      vi.mocked(mockDb.query.activities.findMany).mockResolvedValueOnce([
        { ...mockActivity, entityType: 'route', entityId: '1', user: { id: 1, name: 'Test User' } },
      ])

      // Mock the findMany for route entities
      vi.mocked(mockDb.query.routes.findMany).mockResolvedValueOnce([mockRoute])

      const routeResult = await loadFeed({
        locals: mockLocals,
        url: new URL('http://localhost:3000/feed'),
      })

      expect(routeResult.activities[0].items[0].entityType).toBe('route')
      expect(routeResult.activities[0].entity.type).toBe('route')
    })

    it('should group related activities', async () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
      const fortyMinutesAgo = new Date(now.getTime() - 40 * 60 * 1000)
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

      const mockActivities = [
        {
          ...mockActivity,
          id: 1,
          entityType: 'block',
          entityId: '1',
          parentEntityId: '100',
          parentEntityType: 'area',
          userFk: 1,
          createdAt: now,
        } as schema.Activity,
        {
          ...mockActivity,
          id: 2,
          entityType: 'block',
          entityId: '1',
          parentEntityId: '100',
          parentEntityType: 'area',
          userFk: 1,
          createdAt: fiveMinutesAgo,
        } as schema.Activity,
        {
          ...mockActivity,
          id: 3,
          entityType: 'block',
          entityId: '2',
          parentEntityId: '100',
          parentEntityType: 'area',
          userFk: 1,
          createdAt: fortyMinutesAgo,
        } as schema.Activity,
        {
          ...mockActivity,
          id: 4,
          entityType: 'block',
          entityId: '1',
          parentEntityId: '100',
          parentEntityType: 'area',
          userFk: 2,
          createdAt: oneHourAgo,
        } as schema.Activity,
      ]

      vi.mocked(mockDb.query.activities.findMany).mockResolvedValueOnce(
        mockActivities.map((activity, index) => ({
          ...activity,
          user: index === 3 ? { id: 2, name: 'Other User' } : { id: 1, name: 'Test User' },
        })),
      )

      // Mock the batch queries for resolveEntities
      vi.mocked(mockDb.query.blocks.findMany).mockResolvedValueOnce([
        { id: 1, name: 'Block 1', area: mockArea },
        { id: 2, name: 'Block 2', area: mockArea },
      ])

      vi.mocked(mockDb.query.areas.findMany).mockResolvedValueOnce([{ id: 100, name: 'Area 100', parent: null }])

      const result = await loadFeed({
        locals: mockLocals,
        url: new URL('http://localhost:3000/feed'),
      })

      // Should create 2 groups:
      // 1. Three activities for blocks by user 1 (all within 3 hours and same parent area)
      // 2. One activity for block by user 2
      expect(result.activities).toHaveLength(2)

      // First group should have 3 activities (all connected by parent area)
      expect(result.activities[0].items).toHaveLength(3)
      expect(result.activities[0].items.map((i) => i.id)).toEqual([1, 2, 3])
      expect(result.activities[0].user.id).toBe(1)
      expect(result.activities[0].latestDate).toEqual(now)

      // Second group should have 1 activity (different user)
      expect(result.activities[1].items).toHaveLength(1)
      expect(result.activities[1].items[0].id).toBe(4)
      expect(result.activities[1].user.id).toBe(2)
    })

    it('should group activities without parent entities', async () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

      const mockActivities = [
        {
          ...mockActivity,
          id: 1,
          entityType: 'area',
          entityId: '1',
          parentEntityId: null,
          parentEntityType: null,
          userFk: 1,
          createdAt: now,
        } satisfies schema.Activity,
        {
          ...mockActivity,
          id: 2,
          entityType: 'area',
          entityId: '1',
          parentEntityId: null,
          parentEntityType: null,
          userFk: 1,
          createdAt: fiveMinutesAgo,
        } satisfies schema.Activity,
      ]

      vi.mocked(mockDb.query.activities.findMany).mockResolvedValueOnce(
        mockActivities.map((activity) => ({ ...activity, user: mockSchemaUser })),
      )

      // Mock the batch query for areas
      vi.mocked(mockDb.query.areas.findMany).mockResolvedValueOnce([mockArea])

      const result = await loadFeed({
        locals: mockLocals,
        url: new URL('http://localhost:3000/feed'),
      })

      expect(result.activities).toHaveLength(1)
      expect(result.activities[0].items).toHaveLength(2)
      expect(result.activities[0].parentEntity).toBeUndefined()
      expect(result.activities[0].entity.type).toBe('area')
    })

    it('should handle invalid search params', async () => {
      await expect(
        loadFeed({
          locals: mockLocals,
          url: new URL('http://localhost:3000/feed?page=invalid'),
        }),
      ).rejects.toThrow()
    })

    it('should use caching for standard feed queries', async () => {
      const { getFromCacheWithDefault, caches } = vi.mocked(await import('$lib/cache/cache.server'))

      // Initial call to loadFeed
      await loadFeed({
        locals: mockLocals,
        url: new URL('http://localhost:3000/feed'),
      })

      // Verify getFromCacheWithDefault was called with the correct arguments
      expect(getFromCacheWithDefault).toHaveBeenCalled()
      expect(getFromCacheWithDefault).toHaveBeenCalledWith(
        caches.activityFeed,
        mockLocals.userRegions,
        expect.any(Function),
        expect.any(Function),
        null,
      )
    })
  })

  describe('groupActivities', () => {
    const mockOtherUser = {
      id: 2,
      authUserFk: 'auth0|456',
      username: 'Other User',
      firstAscensionistFk: null,
      userSettingsFk: null,
      createdAt: new Date(),
    }

    const mockRoute = (id: number): Entity => ({
      type: 'route',
      object: {
        id,
        name: `Route ${id}`,
        createdAt: new Date(),
        description: null,
        slug: `route-${id}`,
        createdBy: 1,
        gradeFk: null,
        rating: null,
        firstAscentYear: null,
        blockFk: 1,
        externalResourcesFk: null,
        areaFks: [],
        userRating: null,
        userGradeFk: null,
        regionFk: 1,
      },
    })

    const mockBlock = (id: number): Entity => ({
      type: 'block',
      object: {
        id,
        name: `Block ${id}`,
        createdAt: new Date(),
        slug: `block-${id}`,
        createdBy: 1,
        areaFk: 100,
        geolocationFk: null,
        order: 0,
        regionFk: 1,
      },
    })

    const mockArea = (id: number): Entity => ({
      type: 'area',
      object: {
        id,
        name: `Area ${id}`,
        createdAt: new Date(),
        description: null,
        slug: `area-${id}`,
        type: 'area',
        visibility: 'public',
        parentFk: null,
        createdBy: 1,
        walkingPaths: [],
        regionFk: 1,
      },
    })

    it('should group activities by the same user within time limit and entity relationships', () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)

      const activities: ActivityDTO[] = [
        {
          id: 1,
          type: 'created',
          entityType: 'route',
          entityId: '1',
          userFk: 1,
          createdAt: now,
          user: mockSchemaUser,
          entity: mockRoute(1),
          parentEntityId: '1', // Same parent block
          parentEntityType: 'block',
          parentEntity: mockBlock(1),
          columnName: null,
          oldValue: null,
          newValue: null,
          metadata: null,
          notified: null,
          regionFk: 1,
          region: mockRegion,
        },
        {
          id: 2,
          type: 'created',
          entityType: 'route',
          entityId: '2',
          userFk: 1,
          createdAt: oneHourAgo,
          user: mockSchemaUser,
          entity: mockRoute(2),
          parentEntityId: '1', // Same parent block
          parentEntityType: 'block',
          parentEntity: mockBlock(1),
          columnName: null,
          oldValue: null,
          newValue: null,
          metadata: null,
          notified: null,
          regionFk: 1,
          region: mockRegion,
        },
        {
          id: 3,
          type: 'created',
          entityType: 'route',
          entityId: '3',
          userFk: 1,
          createdAt: fourHoursAgo,
          user: mockSchemaUser,
          entity: mockRoute(3),
          parentEntityId: '2', // Different parent block
          parentEntityType: 'block',
          parentEntity: mockBlock(2),
          columnName: null,
          oldValue: null,
          newValue: null,
          metadata: null,
          notified: null,
          regionFk: 1,
          region: mockRegion,
        },
      ]

      const result = groupActivities(activities)

      // Test that activities within time limit and same parent are grouped together
      const groups = result.map((group) => group.items.map((item) => new Date(item.createdAt).getTime()))

      // Verify each group's time span is within the configured limit
      groups.forEach((groupTimes) => {
        const timeSpan = Math.max(...groupTimes) - Math.min(...groupTimes)
        expect(timeSpan).toBeLessThanOrEqual(config.activityFeed.groupTimeLimit)
      })

      // Verify that activities beyond time limit or different parents are in different groups
      const allPairs = result.flatMap((group) =>
        group.items.flatMap((item1) =>
          group.items.map((item2) => ({
            time1: new Date(item1.createdAt).getTime(),
            time2: new Date(item2.createdAt).getTime(),
            sameParent: item1.parentEntityId === item2.parentEntityId,
          })),
        ),
      )

      allPairs.forEach(({ time1, time2, sameParent }) => {
        const timeDiff = Math.abs(time1 - time2)
        expect(timeDiff).toBeLessThanOrEqual(config.activityFeed.groupTimeLimit)
        expect(sameParent).toBe(true)
      })

      // Verify the grouping structure
      expect(result).toHaveLength(2)
      expect(result[0].items).toHaveLength(2) // First group has activities within time limit and same parent
      expect(result[1].items).toHaveLength(1) // Second group has the activity with different parent
    })

    it('should group activities by connected entities', () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

      const activities: ActivityDTO[] = [
        {
          id: 1,
          type: 'created',
          entityType: 'block',
          entityId: '1',
          parentEntityType: 'area',
          parentEntityId: '100',
          userFk: 1,
          createdAt: now,
          user: mockSchemaUser,
          entity: mockBlock(1),
          parentEntity: mockArea(100),
          columnName: null,
          oldValue: null,
          newValue: null,
          metadata: null,
          notified: null,
          regionFk: 1,
          region: mockRegion,
        },
        {
          id: 2,
          type: 'created',
          entityType: 'route',
          entityId: '1',
          parentEntityType: 'block',
          parentEntityId: '1',
          userFk: 1,
          createdAt: fiveMinutesAgo,
          user: mockSchemaUser,
          entity: mockRoute(1),
          parentEntity: mockBlock(1),
          columnName: null,
          oldValue: null,
          newValue: null,
          metadata: null,
          notified: null,
          regionFk: 1,
          region: mockRegion,
        },
      ]

      const result = groupActivities(activities)
      expect(result).toHaveLength(1) // Should be grouped together due to connected entities
      expect(result[0].items).toHaveLength(2)
    })

    it('should not group activities from different users', () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

      const activities: ActivityDTO[] = [
        {
          id: 1,
          type: 'created',
          entityType: 'route',
          entityId: '1',
          userFk: 1,
          createdAt: now,
          user: mockSchemaUser,
          entity: mockRoute(1),
          parentEntityId: null,
          parentEntityType: null,
          columnName: null,
          oldValue: null,
          newValue: null,
          metadata: null,
          notified: null,
          regionFk: 1,
          region: mockRegion,
        },
        {
          id: 2,
          type: 'created',
          entityType: 'route',
          entityId: '1',
          userFk: 2,
          createdAt: fiveMinutesAgo,
          user: mockOtherUser,
          entity: mockRoute(1),
          parentEntityId: null,
          parentEntityType: null,
          columnName: null,
          oldValue: null,
          newValue: null,
          metadata: null,
          notified: null,
          regionFk: 1,
          region: mockRegion,
        },
      ]

      const result = groupActivities(activities)
      expect(result).toHaveLength(2) // Should be in separate groups due to different users
      expect(result[0].items).toHaveLength(1)
      expect(result[1].items).toHaveLength(1)
    })

    it('should handle empty activities array', () => {
      const result = groupActivities([])
      expect(result).toHaveLength(0)
    })

    it('should group activities with shared parent entities', () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

      const activities: ActivityDTO[] = [
        {
          id: 1,
          type: 'created',
          entityType: 'route',
          entityId: '1',
          parentEntityType: 'block',
          parentEntityId: '100',
          userFk: 1,
          createdAt: now,
          user: mockSchemaUser,
          entity: mockRoute(1),
          parentEntity: mockBlock(100),
          columnName: null,
          oldValue: null,
          newValue: null,
          metadata: null,
          notified: null,
          regionFk: 1,
          region: mockRegion,
        },
        {
          id: 2,
          type: 'created',
          entityType: 'route',
          entityId: '2',
          parentEntityType: 'block',
          parentEntityId: '100',
          userFk: 1,
          createdAt: fiveMinutesAgo,
          user: mockSchemaUser,
          entity: mockRoute(2),
          parentEntity: mockBlock(100),
          columnName: null,
          oldValue: null,
          newValue: null,
          metadata: null,
          notified: null,
          regionFk: 1,
          region: mockRegion,
        },
      ]

      const result = groupActivities(activities)
      expect(result).toHaveLength(1) // Should be grouped together due to shared parent
      expect(result[0].items).toHaveLength(2)
      expect(result[0].parentEntity).toBeDefined()
      const parentEntity = result[0].parentEntity
      expect(parentEntity?.object?.id).toBe(100)
    })
  })

  describe('createUpdateActivity', () => {
    it('should create activities for changed fields', async () => {
      const oldEntity = { name: 'Old Name', description: 'Old Description' }
      const newEntity = { name: 'New Name', description: 'Old Description' }

      // Mock that there are no existing activities
      vi.mocked(mockDb.query.activities.findMany).mockResolvedValueOnce([])

      await createUpdateActivity({
        oldEntity,
        newEntity,
        db: mockDb as unknown as PostgresJsDatabase<typeof schema>,
        entityId: '1',
        entityType: 'route',
        userFk: 1,
        parentEntityId: null,
        parentEntityType: null,
        regionFk: 1,
      })

      expect(mockDb.insert).toHaveBeenCalledWith(schema.activities)
      expect(mockDb.insert).toHaveBeenCalledTimes(1)
    })

    it('should handle null values correctly', async () => {
      const oldEntity = { name: 'Old Name', description: null }
      const newEntity = { name: 'Old Name', description: 'New Description' }

      // Mock that there are no existing activities
      vi.mocked(mockDb.query.activities.findMany).mockResolvedValueOnce([])

      await createUpdateActivity({
        oldEntity,
        newEntity,
        db: mockDb as unknown as PostgresJsDatabase<typeof schema>,
        entityId: '1',
        entityType: 'route',
        userFk: 1,
        parentEntityId: null,
        parentEntityType: null,
        regionFk: 1,
      })

      expect(mockDb.insert).toHaveBeenCalledWith(schema.activities)
    })

    it('should not create activities when no changes', async () => {
      const entity = { name: 'Same Name', description: 'Same Description' }

      // This call shouldn't matter since there are no changes
      vi.mocked(mockDb.query.activities.findMany).mockResolvedValueOnce([])

      await createUpdateActivity({
        oldEntity: entity,
        newEntity: entity,
        db: mockDb as unknown as PostgresJsDatabase<typeof schema>,
        entityId: '1',
        entityType: 'route',
        userFk: 1,
        parentEntityId: null,
        parentEntityType: null,
        regionFk: 1,
      })

      expect(mockDb.insert).not.toHaveBeenCalled()
    })

    it('should update existing activity instead of creating a new one', async () => {
      const oldEntity = { name: 'Old Name', description: 'Old Description' }
      const newEntity = { name: 'New Name', description: 'Updated Description' }

      // Mock an existing "updated" activity for the "name" field
      const existingActivity = {
        id: 1,
        type: 'updated',
        entityType: 'route',
        entityId: '1',
        userFk: 1,
        columnName: 'name',
        oldValue: 'Old Name',
        newValue: 'Previous Update',
        createdAt: new Date(),
      } as schema.Activity

      vi.mocked(mockDb.query.activities.findMany).mockResolvedValueOnce([existingActivity])

      // Setup the update mock
      const updateMock = { set: vi.fn().mockReturnValue({ where: vi.fn() }) }
      vi.mocked(mockDb).update = vi.fn().mockReturnValue(updateMock)

      await createUpdateActivity({
        oldEntity,
        newEntity,
        db: mockDb as unknown as PostgresJsDatabase<typeof schema>,
        entityId: '1',
        entityType: 'route',
        userFk: 1,
        parentEntityId: null,
        parentEntityType: null,
        regionFk: 1,
      })

      // Should update the existing activity for "name"
      expect(mockDb.update).toHaveBeenCalledWith(schema.activities)
      expect(updateMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: expect.any(Date),
          newValue: 'New Name',
        }),
      )

      // Should still create a new activity for "description"
      expect(mockDb.insert).toHaveBeenCalledWith(schema.activities)
      expect(vi.mocked(mockDb.insert).mock.calls[0][0]).toBe(schema.activities)
      // Check that the values array contains an activity for "description"
      const insertValues = vi.mocked(mockDb.insert().values).mock.calls[0][0]
      expect(insertValues).toHaveLength(1)
      expect(insertValues[0]).toMatchObject({
        columnName: 'description',
        oldValue: 'Old Description',
        newValue: 'Updated Description',
      })
    })

    it('should not create any activities if a recent created activity exists', async () => {
      const oldEntity = { name: 'Old Name' }
      const newEntity = { name: 'New Name' }

      // Mock an existing "created" activity
      const existingActivity = {
        id: 1,
        type: 'created',
        entityType: 'route',
        entityId: '1',
        userFk: 1,
        createdAt: new Date(),
      } as schema.Activity

      vi.mocked(mockDb.query.activities.findMany).mockResolvedValueOnce([existingActivity])

      await createUpdateActivity({
        oldEntity,
        newEntity,
        db: mockDb as unknown as PostgresJsDatabase<typeof schema>,
        entityId: '1',
        entityType: 'route',
        userFk: 1,
        parentEntityId: null,
        parentEntityType: null,
        regionFk: 1,
      })

      // Should not create or update any activities
      expect(mockDb.insert).not.toHaveBeenCalled()
      expect(mockDb.update).not.toHaveBeenCalled()
    })
  })

  describe('insertActivity', () => {
    it('should insert a single activity and invalidate cache', async () => {
      const activity = {
        type: 'created',
        userFk: 1,
        entityId: '1',
        entityType: 'route',
        parentEntityId: null,
        parentEntityType: null,
      } as schema.InsertActivity

      await insertActivity(mockDb as unknown as PostgresJsDatabase<typeof schema>, activity)

      expect(mockDb.insert).toHaveBeenCalledWith(schema.activities)
      expect(mockDb.insert().values).toHaveBeenCalledWith([activity])
    })

    it('should insert multiple activities and invalidate cache once', async () => {
      const activities = [
        {
          type: 'created',
          userFk: 1,
          entityId: '1',
          entityType: 'route',
          parentEntityId: null,
          parentEntityType: null,
        },
        {
          type: 'created',
          userFk: 1,
          entityId: '2',
          entityType: 'route',
          parentEntityId: null,
          parentEntityType: null,
        },
      ] as schema.InsertActivity[]

      await insertActivity(mockDb as unknown as PostgresJsDatabase<typeof schema>, activities)

      expect(mockDb.insert).toHaveBeenCalledWith(schema.activities)
      expect(mockDb.insert().values).toHaveBeenCalledWith(activities)
    })

    it('should not do anything if an empty array is provided', async () => {
      await insertActivity(mockDb as unknown as PostgresJsDatabase<typeof schema>, [])

      expect(mockDb.insert).not.toHaveBeenCalled()
    })
  })
})
