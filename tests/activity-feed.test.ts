import { REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '$lib/auth'
import { createUpdateActivity, insertActivity } from '$lib/components/ActivityFeed/load.server'
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
  createdBy: 1,
  id: 1,
  maxMembers: 10,
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
