import { REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '$lib/auth'
import { db } from '$lib/db/db.server'
import { appRole } from '$lib/db/schema'
import { supabase } from '$lib/hooks/auth'
import type { RequestEvent } from '@sveltejs/kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Supabase client
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(() => ({ data: { session: { user: { id: '1' } } } })),
      getUser: vi.fn(() => ({ data: { user: {} } })),
    },
  })),
}))

// Mock the eq function from drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => true), // Just return true for any comparison
  relations: vi.fn(),
}))

// Mock the schema
vi.mock('$lib/db/schema', () => ({
  users: { authUserFk: 'authUserFk' },
  userRoles: { authUserFk: 'authUserFk' },
  rolePermissions: { role: 'role' },
  appRole: {
    enumValues: ['user', 'maintainer', 'admin'],
  },
}))

// Mock database client
vi.mock('$lib/db/db.server', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
      userRoles: {
        findFirst: vi.fn(),
      },
      rolePermissions: {
        findMany: vi.fn(),
      },
      regionMembers: {
        findMany: vi.fn(),
      },
    },
  },
}))

// Mock environment variables
vi.mock('$env/static/public', () => ({
  PUBLIC_APPLICATION_NAME: 'Test App',
  PUBLIC_SUPABASE_URL: '',
  PUBLIC_SUPABASE_ANON_KEY: '',
}))

describe('Permission Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Auth Hook Permissions', () => {
    const createMockEvent = () =>
      ({
        locals: {},
        cookies: {
          getAll: vi.fn().mockReturnValue([]),
          set: vi.fn(),
        },
      }) as unknown as RequestEvent

    it('should grant maintainer all permissions', async () => {
      const event = createMockEvent()

      vi.mocked(db.query.users.findFirst).mockResolvedValue({
        id: 1,
        authUserFk: '1',
        username: 'test',
        firstAscensionistFk: null,
        userSettingsFk: null,
        createdAt: new Date(),
      })
      vi.mocked(db.query.userRoles.findFirst).mockResolvedValue({
        id: 1,
        role: appRole.enumValues[1],
        authUserFk: '1',
      })
      vi.mocked(db.query.rolePermissions.findMany).mockResolvedValue([
        { id: 1, role: appRole.enumValues[1], permission: REGION_PERMISSION_READ },
        { id: 2, role: appRole.enumValues[1], permission: REGION_PERMISSION_EDIT },
      ])
      vi.mocked(db.query.regionMembers.findMany).mockResolvedValue([
        {
          id: 1,
          authUserFk: '1',
          createdAt: new Date(),
          isActive: true,
          invitedBy: null,
          regionFk: 1,
          userFk: 1,
          role: 'region_admin',
        },
      ])

      await supabase({ event, resolve: vi.fn() })
      const { userPermissions, userRole } = await event.locals.safeGetSession()

      expect(userRole).toBe(appRole.enumValues[1])
      expect(userPermissions).toContain(REGION_PERMISSION_READ)
      expect(userPermissions).toContain(REGION_PERMISSION_EDIT)
    })

    it('should grant regular users only read permissions', async () => {
      const event = createMockEvent()

      vi.mocked(db.query.users.findFirst).mockResolvedValue({
        id: 1,
        authUserFk: '1',
        username: 'test',
        firstAscensionistFk: null,
        userSettingsFk: null,
        createdAt: new Date(),
      })
      vi.mocked(db.query.userRoles.findFirst).mockResolvedValue({
        id: 1,
        role: appRole.enumValues[0],
        authUserFk: '1',
      })
      vi.mocked(db.query.rolePermissions.findMany).mockResolvedValue([
        { id: 1, role: appRole.enumValues[0], permission: REGION_PERMISSION_READ },
      ])
      vi.mocked(db.query.regionMembers.findMany).mockResolvedValue([
        {
          id: 1,
          authUserFk: '1',
          createdAt: new Date(),
          isActive: true,
          invitedBy: null,
          regionFk: 1,
          userFk: 1,
          role: 'region_admin',
        },
      ])

      await supabase({ event, resolve: vi.fn() })
      const { userPermissions, userRole } = await event.locals.safeGetSession()

      expect(userRole).toBe(appRole.enumValues[0])
      expect(userPermissions).toContain(REGION_PERMISSION_READ)
      expect(userPermissions).not.toContain(REGION_PERMISSION_EDIT)
    })
  })
})
