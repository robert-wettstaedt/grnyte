import { EDIT_PERMISSION, READ_PERMISSION } from '$lib/auth'
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
        { id: 1, role: appRole.enumValues[1], permission: READ_PERMISSION },
        { id: 2, role: appRole.enumValues[1], permission: EDIT_PERMISSION },
      ])

      await supabase({ event, resolve: vi.fn() })
      const { userPermissions, userRole } = await event.locals.safeGetSession()

      expect(userRole).toBe(appRole.enumValues[1])
      expect(userPermissions).toContain(READ_PERMISSION)
      expect(userPermissions).toContain(EDIT_PERMISSION)
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
        { id: 1, role: appRole.enumValues[0], permission: READ_PERMISSION },
      ])

      await supabase({ event, resolve: vi.fn() })
      const { userPermissions, userRole } = await event.locals.safeGetSession()

      expect(userRole).toBe(appRole.enumValues[0])
      expect(userPermissions).toContain(READ_PERMISSION)
      expect(userPermissions).not.toContain(EDIT_PERMISSION)
    })
  })
})
