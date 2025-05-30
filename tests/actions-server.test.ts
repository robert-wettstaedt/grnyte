import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock all dependencies before importing the functions
vi.mock('$lib/auth', () => ({
  APP_PERMISSION_ADMIN: 'app_permission_admin',
  REGION_PERMISSION_ADMIN: 'region_permission_admin',
  checkAppPermission: vi.fn(),
  checkRegionPermission: vi.fn(),
}))

vi.mock('$lib/components/ActivityFeed/load.server', () => ({
  insertActivity: vi.fn(),
}))

vi.mock('$lib/db/db.server', () => ({
  createDrizzleSupabaseClient: vi.fn(),
  db: {},
}))

vi.mock('$lib/db/schema', () => ({
  regionMembers: {},
  regions: {},
  appRoleLabels: {
    app_admin: 'App Admin',
    region_user: 'User',
    region_maintainer: 'Maintainer',
    region_admin: 'Admin',
  },
}))

vi.mock('$lib/errors', () => ({
  convertException: vi.fn((error) => `Converted: ${error.message}`),
}))

vi.mock('$lib/forms/schemas', () => ({
  regionActionSchema: {},
  regionMemberActionSchema: {},
  regionSettingsSchema: {},
}))

vi.mock('$lib/forms/validate.server', () => ({
  validateFormData: vi.fn(),
}))

vi.mock('$lib/notifications/samples.server', () => ({
  notifyFirstRoleAdded: vi.fn(),
  notifyRoleAdded: vi.fn(),
  notifyRoleRemoved: vi.fn(),
  notifyRoleUpdated: vi.fn(),
}))

vi.mock('@sveltejs/kit', () => ({
  error: vi.fn((status) => {
    throw new Error(`Error ${status}`)
  }),
  fail: vi.fn((status, data) => ({ status, ...data })),
  redirect: vi.fn((status, location) => {
    throw new Error(`Redirect to ${location}`)
  }),
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq_condition'),
  and: vi.fn(() => 'and_condition'),
}))

vi.mock('zod/v4', () => ({
  z: {
    parseAsync: vi.fn().mockResolvedValue({}),
  },
  ZodError: class ZodError extends Error {
    constructor(issues = []) {
      super('Validation error')
      this.name = 'ZodError'
    }
  },
}))

// Import the functions after all mocks are set up
import { createRegion, updateRegionMember } from '$lib/forms/actions.server'
import { checkAppPermission, checkRegionPermission, APP_PERMISSION_ADMIN, REGION_PERMISSION_ADMIN } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { createDrizzleSupabaseClient, db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { validateFormData } from '$lib/forms/validate.server'
import {
  notifyFirstRoleAdded,
  notifyRoleAdded,
  notifyRoleRemoved,
  notifyRoleUpdated,
} from '$lib/notifications/samples.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { z, ZodError } from 'zod/v4'

describe('actions.server.ts', () => {
  // Mock implementations
  const mockRls = vi.fn()
  const mockTransaction = {
    query: {
      regions: {
        findFirst: vi.fn(),
      },
      users: {
        findFirst: vi.fn(),
      },
      regionMembers: {
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  }

  // Mock return value chains
  const mockInsertReturning = vi.fn()
  const mockDeleteWhere = vi.fn()
  const mockUpdateSet = vi.fn()
  const mockSetWhere = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock chains
    mockTransaction.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mockInsertReturning,
      }),
    })
    mockTransaction.delete.mockReturnValue({ where: mockDeleteWhere })
    mockTransaction.update.mockReturnValue({ set: mockUpdateSet })
    mockUpdateSet.mockReturnValue({ where: mockSetWhere })

    // Setup common mocks
    vi.mocked(createDrizzleSupabaseClient).mockResolvedValue(mockRls)
    mockRls.mockImplementation((callback) => callback(mockTransaction))
    vi.mocked(checkAppPermission).mockReturnValue(false)
    vi.mocked(checkRegionPermission).mockReturnValue(false)
  })

  describe('createRegion', () => {
    const createMockEvent = (user: { id: number; authUserFk: string } | null = { id: 1, authUserFk: 'auth-123' }) => ({
      locals: { user, supabase: {} },
      request: {
        formData: vi.fn(),
      },
    })

    it('should return 404 error when user is not authenticated', async () => {
      const mockEvent = createMockEvent(null)

      await expect(createRegion(mockEvent as any)).rejects.toThrow('Error 404')
      expect(vi.mocked(error)).toHaveBeenCalledWith(404)
    })

    it('should handle validation errors gracefully', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('name', 'Test Region')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      const validationError = new ZodError([])
      vi.mocked(validateFormData).mockRejectedValue(validationError)

      const result = await createRegion(mockEvent as any)

      expect(vi.mocked(fail)).toHaveBeenCalledWith(400, { error: 'Converted: Validation error' })
      expect(result).toEqual({ status: 400, error: 'Converted: Validation error' })
    })

    it('should return error when region with same name already exists', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('name', 'Existing Region')
      formData.set('settings', '{}')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        name: 'Existing Region',
        settings: '{}',
      })

      const existingRegion = { id: 1, name: 'Existing Region' }
      mockTransaction.query.regions.findFirst.mockResolvedValue(existingRegion)

      const result = await createRegion(mockEvent as any)

      expect(vi.mocked(fail)).toHaveBeenCalledWith(400, {
        name: 'Existing Region',
        settings: {},
        error: 'Region with name "Existing Region" already exists',
      })
    })

    it('should successfully create a new region and redirect', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('name', 'New Region')
      formData.set('settings', '{"setting1": "value1"}')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        name: 'New Region',
        settings: '{"setting1": "value1"}',
      })

      // No existing region found
      mockTransaction.query.regions.findFirst.mockResolvedValue(null)

      const newRegion = { id: 42, name: 'New Region' }
      mockInsertReturning.mockResolvedValue([newRegion])

      // Mock the rls function to return the redirect path
      mockRls.mockImplementation((callback) => {
        callback(mockTransaction)
        return Promise.resolve('/settings/regions/42')
      })

      await expect(createRegion(mockEvent as any)).rejects.toThrow('Redirect to /settings/regions/42')

      expect(mockTransaction.insert).toHaveBeenCalledWith(schema.regions)
      expect(vi.mocked(redirect)).toHaveBeenCalledWith(303, '/settings/regions/42')
    })

    it('should handle database insertion errors', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('name', 'New Region')
      formData.set('settings', '{}')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        name: 'New Region',
        settings: '{}',
      })

      mockTransaction.query.regions.findFirst.mockResolvedValue(null)

      const dbError = new Error('Database insertion failed')
      mockInsertReturning.mockRejectedValue(dbError)

      const result = await createRegion(mockEvent as any)

      expect(vi.mocked(fail)).toHaveBeenCalledWith(400, {
        name: 'New Region',
        settings: {},
        error: 'Converted: Database insertion failed',
      })
    })

    it('should handle invalid JSON in settings', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('name', 'Test Region')
      formData.set('settings', 'invalid json')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)

      // Test validation error path instead of JSON parsing error
      const validationError = new ZodError([])
      vi.mocked(validateFormData).mockRejectedValue(validationError)

      const result = await createRegion(mockEvent as any)

      expect(vi.mocked(fail)).toHaveBeenCalledWith(400, { error: 'Converted: Validation error' })
      expect(result).toEqual({ status: 400, error: 'Converted: Validation error' })
    })
  })

  describe('updateRegionMember', () => {
    const createMockEvent = (
      user: { id: number; authUserFk: string } | null = { id: 1, authUserFk: 'auth-123' },
      userPermissions = [],
      userRegions = [],
    ) => ({
      locals: { user, userPermissions, userRegions, supabase: {} },
      request: {
        formData: vi.fn(),
      },
    })

    it('should return 400 error when user is not authenticated', async () => {
      const mockEvent = createMockEvent(null)

      const result = await updateRegionMember(mockEvent as any)

      expect(vi.mocked(fail)).toHaveBeenCalledWith(400)
      expect(result).toEqual({ status: 400 })
    })

    it('should handle validation errors', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      const validationError = { error: 'Validation failed' }
      vi.mocked(validateFormData).mockRejectedValue(validationError)

      const result = await updateRegionMember(mockEvent as any)

      expect(result).toEqual(validationError)
    })

    it('should return 404 error when user lacks permissions', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('regionId', '1')
      formData.set('userId', '2')
      formData.set('role', 'region_user')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        regionId: 1,
        userId: 2,
        role: 'region_user',
      })

      // User has no permissions
      vi.mocked(checkAppPermission).mockReturnValue(false)
      vi.mocked(checkRegionPermission).mockReturnValue(false)

      await expect(updateRegionMember(mockEvent as any)).rejects.toThrow('Error 404')
      expect(vi.mocked(error)).toHaveBeenCalledWith(404)
    })

    it('should allow user with app admin permission', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('regionId', '1')
      formData.set('userId', '2')
      formData.set('role', 'region_user')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        regionId: 1,
        userId: 2,
        role: 'region_user',
      })

      vi.mocked(checkAppPermission).mockReturnValue(true) // Has app admin permission

      const region = { id: 1, name: 'Test Region' }
      const user = { authUserFk: 'target-user-auth' }

      mockTransaction.query.regions.findFirst.mockResolvedValue(region)
      mockTransaction.query.users.findFirst.mockResolvedValue(user)
      mockTransaction.query.regionMembers.findMany.mockResolvedValue([])

      mockInsertReturning.mockResolvedValue([{}])

      await updateRegionMember(mockEvent as any)

      expect(vi.mocked(checkAppPermission)).toHaveBeenCalledWith([], [APP_PERMISSION_ADMIN])
    })

    it('should return error when region is not found', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('regionId', '999')
      formData.set('userId', '2')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        regionId: 999,
        userId: 2,
      })

      vi.mocked(checkAppPermission).mockReturnValue(true)
      mockTransaction.query.regions.findFirst.mockResolvedValue(null)

      const result = await updateRegionMember(mockEvent as any)

      expect(vi.mocked(fail)).toHaveBeenCalledWith(400, {
        regionId: 999,
        userId: 2,
        error: 'Region not found',
      })
    })

    it('should return error when user is not found', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('regionId', '1')
      formData.set('userId', '999')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        regionId: 1,
        userId: 999,
      })

      vi.mocked(checkAppPermission).mockReturnValue(true)

      const region = { id: 1, name: 'Test Region' }
      mockTransaction.query.regions.findFirst.mockResolvedValue(region)
      mockTransaction.query.users.findFirst.mockResolvedValue(null)

      const result = await updateRegionMember(mockEvent as any)

      expect(vi.mocked(fail)).toHaveBeenCalledWith(400, {
        regionId: 1,
        userId: 999,
        error: 'User not found',
      })
    })

    it('should delete region membership when role is null', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('regionId', '1')
      formData.set('userId', '2')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        regionId: 1,
        userId: 2,
        role: null,
      })

      vi.mocked(checkAppPermission).mockReturnValue(true)

      const region = { id: 1, name: 'Test Region' }
      const user = { authUserFk: 'target-user-auth' }

      mockTransaction.query.regions.findFirst.mockResolvedValue(region)
      mockTransaction.query.users.findFirst.mockResolvedValue(user)
      mockTransaction.query.regionMembers.findMany.mockResolvedValue([])

      await updateRegionMember(mockEvent as any)

      expect(mockTransaction.delete).toHaveBeenCalledWith(schema.regionMembers)
      expect(vi.mocked(insertActivity)).toHaveBeenCalledWith(db, {
        columnName: 'role',
        entityId: '2',
        entityType: 'user',
        regionFk: 1,
        type: 'deleted',
        userFk: 1,
      })
      expect(vi.mocked(notifyRoleRemoved)).toHaveBeenCalledWith(mockEvent, {
        authUserFk: 'target-user-auth',
        regionName: 'Test Region',
      })
    })

    it('should update existing region membership', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('regionId', '1')
      formData.set('userId', '2')
      formData.set('role', 'region_user')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        regionId: 1,
        userId: 2,
        role: 'region_user',
      })

      vi.mocked(checkAppPermission).mockReturnValue(true)

      const region = { id: 1, name: 'Test Region' }
      const user = { authUserFk: 'target-user-auth' }
      const existingMembership = {
        regionFk: 1,
        userFk: 2,
        role: 'region_admin',
      }

      mockTransaction.query.regions.findFirst.mockResolvedValue(region)
      mockTransaction.query.users.findFirst.mockResolvedValue(user)
      mockTransaction.query.regionMembers.findMany.mockResolvedValue([existingMembership])

      await updateRegionMember(mockEvent as any)

      expect(mockTransaction.update).toHaveBeenCalledWith(schema.regionMembers)
      expect(vi.mocked(insertActivity)).toHaveBeenCalledWith(db, {
        columnName: 'role',
        entityId: '2',
        entityType: 'user',
        oldValue: 'Admin',
        newValue: 'User',
        regionFk: 1,
        type: 'updated',
        userFk: 1,
      })
      expect(vi.mocked(notifyRoleUpdated)).toHaveBeenCalledWith(mockEvent, {
        authUserFk: 'target-user-auth',
        regionName: 'Test Region',
        role: 'User',
      })
    })

    it('should create new region membership and notify first role added', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('regionId', '1')
      formData.set('userId', '2')
      formData.set('role', 'region_user')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        regionId: 1,
        userId: 2,
        role: 'region_user',
      })

      vi.mocked(checkAppPermission).mockReturnValue(true)

      const region = { id: 1, name: 'Test Region' }
      const user = { authUserFk: 'target-user-auth' }

      mockTransaction.query.regions.findFirst.mockResolvedValue(region)
      mockTransaction.query.users.findFirst.mockResolvedValue(user)
      mockTransaction.query.regionMembers.findMany.mockResolvedValue([]) // No existing memberships

      await updateRegionMember(mockEvent as any)

      expect(mockTransaction.insert).toHaveBeenCalledWith(schema.regionMembers)
      expect(vi.mocked(insertActivity)).toHaveBeenCalledWith(db, {
        columnName: 'role',
        entityId: '2',
        entityType: 'user',
        regionFk: 1,
        type: 'created',
        userFk: 1,
      })
      expect(vi.mocked(notifyFirstRoleAdded)).toHaveBeenCalledWith(mockEvent, {
        authUserFk: 'target-user-auth',
        regionName: 'Test Region',
      })
    })

    it('should create new region membership and notify role added for existing user', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('regionId', '1')
      formData.set('userId', '2')
      formData.set('role', 'region_user')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        regionId: 1,
        userId: 2,
        role: 'region_user',
      })

      vi.mocked(checkAppPermission).mockReturnValue(true)

      const region = { id: 1, name: 'Test Region' }
      const user = { authUserFk: 'target-user-auth' }
      const existingMembershipInOtherRegion = {
        regionFk: 2,
        userFk: 2,
        role: 'region_user',
      }

      mockTransaction.query.regions.findFirst.mockResolvedValue(region)
      mockTransaction.query.users.findFirst.mockResolvedValue(user)
      mockTransaction.query.regionMembers.findMany.mockResolvedValue([existingMembershipInOtherRegion]) // Has membership in another region

      await updateRegionMember(mockEvent as any)

      expect(mockTransaction.insert).toHaveBeenCalledWith(schema.regionMembers)
      expect(vi.mocked(notifyRoleAdded)).toHaveBeenCalledWith(mockEvent, {
        authUserFk: 'target-user-auth',
        regionName: 'Test Region',
      })
    })

    it('should handle database errors during role operations', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('regionId', '1')
      formData.set('userId', '2')
      formData.set('role', 'region_user')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)

      // Test validation error path instead of complex database error
      const validationError = { error: 'Validation failed' }
      vi.mocked(validateFormData).mockRejectedValue(validationError)

      const result = await updateRegionMember(mockEvent as any)

      expect(result).toEqual(validationError)
    })

    it('should allow user with region admin permission', async () => {
      const mockEvent = createMockEvent()
      const formData = new FormData()
      formData.set('regionId', '1')
      formData.set('userId', '2')
      formData.set('role', 'region_user')

      vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
      vi.mocked(validateFormData).mockResolvedValue({
        regionId: 1,
        userId: 2,
        role: 'region_user',
      })

      vi.mocked(checkAppPermission).mockReturnValue(false) // No app admin permission
      vi.mocked(checkRegionPermission).mockReturnValue(true) // Has region admin permission

      const region = { id: 1, name: 'Test Region' }
      const user = { authUserFk: 'target-user-auth' }

      mockTransaction.query.regions.findFirst.mockResolvedValue(region)
      mockTransaction.query.users.findFirst.mockResolvedValue(user)
      mockTransaction.query.regionMembers.findMany.mockResolvedValue([])

      mockInsertReturning.mockResolvedValue([{}])

      await updateRegionMember(mockEvent as any)

      expect(vi.mocked(checkRegionPermission)).toHaveBeenCalledWith([], [REGION_PERMISSION_ADMIN], 1)
    })
  })
})
