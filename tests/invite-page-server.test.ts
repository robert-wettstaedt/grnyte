import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock all dependencies before importing the functions
vi.mock('$lib/auth', () => ({
  REGION_PERMISSION_EDIT: 'region_permission_edit',
  checkRegionPermission: vi.fn(),
}))

vi.mock('$lib/components/ActivityFeed/load.server', () => ({
  insertActivity: vi.fn(),
}))

vi.mock('$lib/db/db.server', () => ({
  createDrizzleSupabaseClient: vi.fn(),
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn(),
    }),
  },
}))

vi.mock('$lib/db/schema', () => ({
  regionInvitations: {},
}))

vi.mock('$lib/errors', () => ({
  convertException: vi.fn((error) => `Converted: ${error.message}`),
}))

vi.mock('$lib/forms/validate.server', () => ({
  validateFormData: vi.fn(),
}))

vi.mock('$lib/notifications/samples.server', () => ({
  notifyInvite: vi.fn(),
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

vi.mock('crypto', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    randomUUID: vi.fn(() => 'mock-uuid-token'),
  }
})

vi.mock('date-fns', () => ({
  addDays: vi.fn((date, days) => new Date('2024-01-08T00:00:00.000Z')), // Mock 7 days later
}))

vi.mock('drizzle-orm/supabase', () => ({
  authUsers: {
    id: 'id',
    email: 'email',
  },
}))

vi.mock('zod/v4', () => ({
  z: {
    object: vi.fn(() => ({
      email: {
        email: vi.fn(() => ({})),
      },
    })),
    string: vi.fn(() => ({
      email: vi.fn(() => ({})),
    })),
  },
  ZodError: class ZodError extends Error {
    constructor(issues = []) {
      super('Validation error')
      this.name = 'ZodError'
    }
  },
}))

// Import the actions after all mocks are set up
import { actions } from '$lib/../routes/(app)/settings/regions/[regionId=integer]/invite/+page.server'
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { createDrizzleSupabaseClient, db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { validateFormData } from '$lib/forms/validate.server'
import { notifyInvite } from '$lib/notifications/samples.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { randomUUID } from 'crypto'
import { addDays } from 'date-fns'

describe('invite +page.server.ts - default action', () => {
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
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
  }

  // Mock return value chains
  const mockInsertReturning = vi.fn()
  const mockDbSelectFrom = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock chains
    mockTransaction.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mockInsertReturning,
      }),
    })

    // Setup database select mock chain - simpler approach
    vi.mocked(db.select).mockReturnValue({
      from: mockDbSelectFrom,
    } as any)

    // Setup common mocks
    vi.mocked(createDrizzleSupabaseClient).mockResolvedValue(mockRls)
    mockRls.mockImplementation((callback) => callback(mockTransaction))
    vi.mocked(checkRegionPermission).mockReturnValue(true) // Default to having permission
  })

  const createMockEvent = (
    user: { id: number; username: string } | null = { id: 1, username: 'testuser' },
    userRegions = [],
    regionId = '1',
  ) => ({
    locals: {
      user,
      userRegions,
      supabase: {},
    },
    params: { regionId },
    request: {
      formData: vi.fn(),
    },
    url: {
      origin: 'https://test.com',
    },
  })

  it('should return 404 error when user is not authenticated', async () => {
    const mockEvent = createMockEvent(null)

    // Setup region to exist
    const region = { id: 1, name: 'Test Region' }
    mockTransaction.query.regions.findFirst.mockResolvedValue(region)

    // Setup auth users query result
    mockDbSelectFrom.mockResolvedValue([])

    await expect(actions.default(mockEvent as any)).rejects.toThrow('Error 404')
    expect(vi.mocked(error)).toHaveBeenCalledWith(404)
  })

  it('should return 404 error when region is not found', async () => {
    const mockEvent = createMockEvent()

    // Setup region not found
    mockTransaction.query.regions.findFirst.mockResolvedValue(null)

    // Setup auth users query result
    mockDbSelectFrom.mockResolvedValue([])

    await expect(actions.default(mockEvent as any)).rejects.toThrow('Error 404')
    expect(vi.mocked(error)).toHaveBeenCalledWith(404)
  })

  it('should return 404 error when user lacks region edit permission', async () => {
    const mockEvent = createMockEvent()

    // Setup region to exist
    const region = { id: 1, name: 'Test Region' }
    mockTransaction.query.regions.findFirst.mockResolvedValue(region)

    // User lacks permission
    vi.mocked(checkRegionPermission).mockReturnValue(false)

    // Setup auth users query result
    mockDbSelectFrom.mockResolvedValue([])

    await expect(actions.default(mockEvent as any)).rejects.toThrow('Error 404')
    expect(vi.mocked(error)).toHaveBeenCalledWith(404)
  })

  it('should handle validation errors', async () => {
    const mockEvent = createMockEvent()
    const formData = new FormData()

    vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)

    // Setup region to exist
    const region = { id: 1, name: 'Test Region' }
    mockTransaction.query.regions.findFirst.mockResolvedValue(region)

    // Setup auth users query result
    mockDbSelectFrom.mockResolvedValue([])

    const validationError = { error: 'Validation failed' }
    vi.mocked(validateFormData).mockRejectedValue(validationError)

    const result = await actions.default(mockEvent as any)

    expect(result).toEqual(validationError)
  })

  it('should return error when user is already a member', async () => {
    const mockEvent = createMockEvent()
    const formData = new FormData()
    formData.set('email', 'existing@test.com')

    vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
    vi.mocked(validateFormData).mockResolvedValue({ email: 'existing@test.com' })

    // Setup region to exist
    const region = { id: 1, name: 'Test Region' }
    mockTransaction.query.regions.findFirst.mockResolvedValue(region)

    // Setup existing auth user
    const authUsers = [{ id: 'auth-123', email: 'existing@test.com' }]
    mockDbSelectFrom.mockResolvedValue(authUsers)

    // Setup existing user and member
    const existingUser = { id: 2, authUserFk: 'auth-123' }
    const existingMember = { id: 1, regionFk: 1, userFk: 2, isActive: true }

    mockTransaction.query.users.findFirst.mockResolvedValue(existingUser)
    mockTransaction.query.regionMembers.findFirst.mockResolvedValue(existingMember)

    const result = await actions.default(mockEvent as any)

    expect(vi.mocked(fail)).toHaveBeenCalledWith(400, {
      email: 'existing@test.com',
      error: 'User is already a member of this region',
    })
  })

  it('should successfully create invitation for new user', async () => {
    const mockEvent = createMockEvent()
    const formData = new FormData()
    formData.set('email', 'new@test.com')

    vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
    vi.mocked(validateFormData).mockResolvedValue({ email: 'new@test.com' })

    // Setup region to exist
    const region = { id: 1, name: 'Test Region' }
    mockTransaction.query.regions.findFirst.mockResolvedValue(region)

    // Setup no existing auth user
    mockDbSelectFrom.mockResolvedValue([])

    // Setup no existing user or member
    mockTransaction.query.users.findFirst.mockResolvedValue(null)
    mockTransaction.query.regionMembers.findFirst.mockResolvedValue(null)

    // Setup successful invitation creation
    const invitation = {
      id: 1,
      email: 'new@test.com',
      token: 'mock-uuid-token',
      expiresAt: new Date('2024-01-08T00:00:00.000Z'),
      status: 'pending',
    }
    mockInsertReturning.mockResolvedValue([invitation])

    // Mock the rls function to return the redirect path
    mockRls.mockImplementation((callback) => {
      callback(mockTransaction)
      return Promise.resolve('/settings/regions/1')
    })

    await expect(actions.default(mockEvent as any)).rejects.toThrow('Redirect to /settings/regions/1')

    // Verify invitation was created with correct data
    expect(mockTransaction.insert).toHaveBeenCalledWith(schema.regionInvitations)

    // Verify notification was sent
    expect(vi.mocked(notifyInvite)).toHaveBeenCalledWith(mockEvent, {
      authUserFk: undefined,
      email: 'new@test.com',
      inviteUrl: expect.any(URL),
      regionName: 'Test Region',
      username: 'testuser',
    })

    // Verify activity was logged
    expect(vi.mocked(insertActivity)).toHaveBeenCalledWith(mockTransaction, {
      columnName: 'invitation',
      entityId: '1',
      entityType: 'user',
      newValue: 'new@test.com',
      regionFk: 1,
      type: 'created',
      userFk: 1,
    })

    expect(vi.mocked(redirect)).toHaveBeenCalledWith(303, '/settings/regions/1')
  })

  it('should successfully create invitation for existing auth user', async () => {
    const mockEvent = createMockEvent()
    const formData = new FormData()
    formData.set('email', 'existing@test.com')

    vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
    vi.mocked(validateFormData).mockResolvedValue({ email: 'existing@test.com' })

    // Setup region to exist
    const region = { id: 1, name: 'Test Region' }
    mockTransaction.query.regions.findFirst.mockResolvedValue(region)

    // Setup existing auth user but no app user yet
    const authUsers = [{ id: 'auth-123', email: 'existing@test.com' }]
    mockDbSelectFrom.mockResolvedValue(authUsers)

    // Setup no existing user or member in this region
    mockTransaction.query.users.findFirst.mockResolvedValue(null)
    mockTransaction.query.regionMembers.findFirst.mockResolvedValue(null)

    // Setup successful invitation creation
    const invitation = {
      id: 1,
      email: 'existing@test.com',
      token: 'mock-uuid-token',
    }
    mockInsertReturning.mockResolvedValue([invitation])

    // Mock the rls function to return the redirect path
    mockRls.mockImplementation((callback) => {
      callback(mockTransaction)
      return Promise.resolve('/settings/regions/1')
    })

    await expect(actions.default(mockEvent as any)).rejects.toThrow('Redirect to /settings/regions/1')

    // Verify notification was sent with auth user ID
    expect(vi.mocked(notifyInvite)).toHaveBeenCalledWith(mockEvent, {
      authUserFk: 'auth-123',
      email: 'existing@test.com',
      inviteUrl: expect.any(URL),
      regionName: 'Test Region',
      username: 'testuser',
    })
  })

  it('should handle existing user but not member of this region', async () => {
    const mockEvent = createMockEvent()
    const formData = new FormData()
    formData.set('email', 'user@test.com')

    vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
    vi.mocked(validateFormData).mockResolvedValue({ email: 'user@test.com' })

    // Setup region to exist
    const region = { id: 1, name: 'Test Region' }
    mockTransaction.query.regions.findFirst.mockResolvedValue(region)

    // Setup existing auth user and app user
    const authUsers = [{ id: 'auth-123', email: 'user@test.com' }]
    mockDbSelectFrom.mockResolvedValue(authUsers)

    const existingUser = { id: 2, authUserFk: 'auth-123' }
    mockTransaction.query.users.findFirst.mockResolvedValue(existingUser)

    // User exists but no membership in this region
    mockTransaction.query.regionMembers.findFirst.mockResolvedValue(null)

    // Setup successful invitation creation
    const invitation = {
      id: 1,
      email: 'user@test.com',
      token: 'mock-uuid-token',
    }
    mockInsertReturning.mockResolvedValue([invitation])

    // Mock the rls function to return the redirect path
    mockRls.mockImplementation((callback) => {
      callback(mockTransaction)
      return Promise.resolve('/settings/regions/1')
    })

    await expect(actions.default(mockEvent as any)).rejects.toThrow('Redirect to /settings/regions/1')

    // Should still create invitation since user is not a member of this region
    expect(mockTransaction.insert).toHaveBeenCalledWith(schema.regionInvitations)
  })

  it('should handle inactive member (allow re-invitation)', async () => {
    const mockEvent = createMockEvent()
    const formData = new FormData()
    formData.set('email', 'inactive@test.com')

    vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
    vi.mocked(validateFormData).mockResolvedValue({ email: 'inactive@test.com' })

    // Setup region to exist
    const region = { id: 1, name: 'Test Region' }
    mockTransaction.query.regions.findFirst.mockResolvedValue(region)

    // Setup existing auth user and app user
    const authUsers = [{ id: 'auth-123', email: 'inactive@test.com' }]
    mockDbSelectFrom.mockResolvedValue(authUsers)

    const existingUser = { id: 2, authUserFk: 'auth-123' }
    mockTransaction.query.users.findFirst.mockResolvedValue(existingUser)

    // Query for active members returns null (since the user is inactive, the where clause with isActive=true returns no results)
    mockTransaction.query.regionMembers.findFirst.mockResolvedValue(null)

    // Setup successful invitation creation
    const invitation = {
      id: 1,
      email: 'inactive@test.com',
      token: 'mock-uuid-token',
    }
    mockInsertReturning.mockResolvedValue([invitation])

    // Mock the rls function to return the redirect path
    mockRls.mockImplementation((callback) => {
      callback(mockTransaction)
      return Promise.resolve('/settings/regions/1')
    })

    await expect(actions.default(mockEvent as any)).rejects.toThrow('Redirect to /settings/regions/1')

    // Should create invitation since member is inactive (query returns null for active members)
    expect(mockTransaction.insert).toHaveBeenCalledWith(schema.regionInvitations)
  })

  it('should handle database errors during invitation creation', async () => {
    const mockEvent = createMockEvent()
    const formData = new FormData()
    formData.set('email', 'test@test.com')

    vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
    vi.mocked(validateFormData).mockResolvedValue({ email: 'test@test.com' })

    // Setup region to exist
    const region = { id: 1, name: 'Test Region' }
    mockTransaction.query.regions.findFirst.mockResolvedValue(region)

    // Setup no existing user
    mockDbSelectFrom.mockResolvedValue([])
    mockTransaction.query.users.findFirst.mockResolvedValue(null)
    mockTransaction.query.regionMembers.findFirst.mockResolvedValue(null)

    // Setup database error during invitation creation
    const dbError = new Error('Database insertion failed')
    mockInsertReturning.mockRejectedValue(dbError)

    const result = await actions.default(mockEvent as any)

    expect(vi.mocked(fail)).toHaveBeenCalledWith(400, {
      email: 'test@test.com',
      error: 'Converted: Database insertion failed',
    })
  })

  it('should verify permission check is called with correct parameters', async () => {
    const mockEvent = createMockEvent({ id: 1, username: 'testuser' }, [], '42')
    const formData = new FormData()

    vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)

    // Setup region to exist
    const region = { id: 42, name: 'Test Region' }
    mockTransaction.query.regions.findFirst.mockResolvedValue(region)

    // Setup auth users query result
    mockDbSelectFrom.mockResolvedValue([])

    const validationError = { error: 'Validation failed' }
    vi.mocked(validateFormData).mockRejectedValue(validationError)

    await actions.default(mockEvent as any)

    // Verify permission check was called with correct region ID
    expect(vi.mocked(checkRegionPermission)).toHaveBeenCalledWith([], [REGION_PERMISSION_EDIT], 42)
  })

  it('should generate correct invite URL structure', async () => {
    const mockEvent = createMockEvent()
    const formData = new FormData()
    formData.set('email', 'invite@test.com')

    vi.mocked(mockEvent.request.formData).mockResolvedValue(formData)
    vi.mocked(validateFormData).mockResolvedValue({ email: 'invite@test.com' })

    // Setup region to exist
    const region = { id: 1, name: 'Test Region' }
    mockTransaction.query.regions.findFirst.mockResolvedValue(region)

    // Setup no existing user
    mockDbSelectFrom.mockResolvedValue([])
    mockTransaction.query.users.findFirst.mockResolvedValue(null)
    mockTransaction.query.regionMembers.findFirst.mockResolvedValue(null)

    // Setup successful invitation creation
    const invitation = { id: 1, email: 'invite@test.com' }
    mockInsertReturning.mockResolvedValue([invitation])

    // Mock the rls function to return the redirect path
    mockRls.mockImplementation((callback) => {
      callback(mockTransaction)
      return Promise.resolve('/settings/regions/1')
    })

    await expect(actions.default(mockEvent as any)).rejects.toThrow('Redirect to /settings/regions/1')

    // Verify the invite URL was constructed correctly - just check structure, not exact token
    const notifyCall = vi.mocked(notifyInvite).mock.calls[0][1]
    const inviteUrl = notifyCall.inviteUrl

    expect(inviteUrl.origin).toBe('https://test.com')
    expect(inviteUrl.pathname).toBe('/invite/accept')
    expect(inviteUrl.searchParams.get('token')).toBeTruthy() // Token exists but may not match mock
  })
})
