import * as schema from '$lib/db/schema'
import { updateRoutesUserData } from '$lib/routes.server'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/db/db.server', () => ({
  db: {
    query: {
      routes: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(),
  },
}))

// Mock the database query and update functions
const mockFindFirst = vi.fn()
const mockSet = vi.fn()
const mockWhere = vi.fn()
const mockUpdate = vi.fn()

// Create the mock chain
mockUpdate.mockReturnValue({ set: mockSet })
mockSet.mockReturnValue({ where: mockWhere })
mockWhere.mockResolvedValue(undefined)

const mockDb = {
  query: {
    routes: {
      findFirst: mockFindFirst,
    },
  },
  update: mockUpdate,
} as unknown as PostgresJsDatabase<typeof schema>

describe('updateRoutesUserData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWhere.mockResolvedValue(undefined)
    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })
  })

  it('should return null if route is not found', async () => {
    mockFindFirst.mockResolvedValue(null)

    const result = await updateRoutesUserData(1, mockDb)
    expect(result).toBeNull()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('should calculate mean grade and rating from ascents', async () => {
    const mockRoute = {
      id: 1,
      gradeFk: null,
      rating: null,
      userGradeFk: null,
      userRating: null,
      ascents: [
        { gradeFk: 20, rating: 4 },
        { gradeFk: 22, rating: 5 },
      ],
    }
    mockFindFirst.mockResolvedValue(mockRoute)

    await updateRoutesUserData(1, mockDb)

    expect(mockUpdate).toHaveBeenCalledWith(schema.routes)
    expect(mockSet).toHaveBeenCalledWith({
      userGradeFk: 21, // (20 + 22) / 2
      userRating: 5, // (4 + 5) / 2 rounded
    })
    expect(mockWhere).toHaveBeenCalledWith(eq(schema.routes.id, mockRoute.id))
  })

  it('should include route grade and rating in mean calculation', async () => {
    const mockRoute = {
      id: 1,
      gradeFk: 18,
      rating: 3,
      userGradeFk: null,
      userRating: null,
      ascents: [
        { gradeFk: 20, rating: 4 },
        { gradeFk: 22, rating: 5 },
      ],
    }
    mockFindFirst.mockResolvedValue(mockRoute)

    await updateRoutesUserData(1, mockDb)

    expect(mockUpdate).toHaveBeenCalledWith(schema.routes)
    expect(mockSet).toHaveBeenCalledWith({
      userGradeFk: 20, // (18 + 20 + 22) / 3
      userRating: 4, // (3 + 4 + 5) / 3 rounded
    })
    expect(mockWhere).toHaveBeenCalledWith(eq(schema.routes.id, mockRoute.id))
  })

  it('should handle ascents with null values', async () => {
    const mockRoute = {
      id: 1,
      gradeFk: null,
      rating: null,
      userGradeFk: null,
      userRating: null,
      ascents: [
        { gradeFk: null, rating: 4 },
        { gradeFk: 22, rating: null },
        { gradeFk: 20, rating: 5 },
      ],
    }
    mockFindFirst.mockResolvedValue(mockRoute)

    await updateRoutesUserData(1, mockDb)

    expect(mockUpdate).toHaveBeenCalledWith(schema.routes)
    expect(mockSet).toHaveBeenCalledWith({
      userGradeFk: 21, // (20 + 22) / 2
      userRating: 5, // (4 + 5) / 2 rounded
    })
    expect(mockWhere).toHaveBeenCalledWith(eq(schema.routes.id, mockRoute.id))
  })

  it('should not update if calculated values match existing values', async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      gradeFk: null,
      rating: null,
      userGradeFk: 21,
      userRating: 5,
      ascents: [
        { gradeFk: 20, rating: 4 },
        { gradeFk: 22, rating: 5 },
      ],
    })

    await updateRoutesUserData(1, mockDb)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('should update with null values when no valid values exist', async () => {
    const mockRoute = {
      id: 1,
      gradeFk: null,
      rating: null,
      userGradeFk: 10, // Different from what will be calculated (null)
      userRating: 3, // Different from what will be calculated (null)
      ascents: [
        { gradeFk: null, rating: null },
        { gradeFk: null, rating: null },
      ],
    }
    mockFindFirst.mockResolvedValue(mockRoute)

    await updateRoutesUserData(1, mockDb)

    expect(mockUpdate).toHaveBeenCalledWith(schema.routes)
    expect(mockSet).toHaveBeenCalledWith({
      userGradeFk: null,
      userRating: null,
    })
    expect(mockWhere).toHaveBeenCalledWith(eq(schema.routes.id, mockRoute.id))
  })
})
