import type {
  Ascent,
  Grade,
  RouteExternalResource27crags,
  RouteExternalResource8a,
  RouteExternalResourceTheCrag,
  UserSettings,
} from '$lib/db/schema'
import handler27crags, { type QueryResponse27crags } from '$lib/external-resources/27crags.server'
import handler8a, { type QueryResponse8a } from '$lib/external-resources/8a.server'
import handlerTheCrag from '$lib/external-resources/thecrag.server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock database client
vi.mock('$lib/db/db.server', () => ({
  createDrizzleSupabaseClient: vi.fn(() => {
    const db = {
      query: {
        routeExternalResource27crags: {
          findFirst: vi.fn(() => ({
            searchable_id: 456,
          })),
        },
        routeExternalResource8a: {
          findFirst: vi.fn(() => ({})),
        },
        routeExternalResourceTheCrag: {
          findFirst: vi.fn(() => ({
            url: '',
          })),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
    }

    return vi.fn((cb) => cb(db))
  }),

  keyv: {
    has: vi.fn(() => false),
    set: vi.fn(() => null),
  },
}))

// Mock data
const mockGrades: Grade[] = [
  { id: 1, FB: '6A', V: 'V5' },
  { id: 2, FB: '7A', V: 'V7' },
]

const mockUserSettings: UserSettings = {
  id: 1,
  userFk: 1,
  authUserFk: 'test-user',
  cookie8a: 'test-cookie-8a',
  cookie27crags: 'test-cookie-27crags',
  cookieTheCrag: 'test-cookie-thecrag',
  gradingScale: 'FB',
  notifyModerations: false,
  notifyNewAscents: false,
  notifyNewUsers: false,
}

const mockLocals = {
  user: { id: 'test-user-id' },
  supabase: {
    client: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
      },
    },
  },
} as unknown as App.Locals

// Mock fetch responses
const mock27cragsRouteResponse: QueryResponse27crags = {
  search_keys: [
    {
      name: 'Test Route',
      description: 'Test Description in test-crag',
      searchable_id: 456,
      searchable_type: 'Route',
      country_name: 'Test Country',
      location_name: 'Test Location',
      crag_id: 6341,
      latitude: 41.9798,
      longitude: 2.34402,
      path: '/crags/foo/topos/bar',
    },
  ],
}

const mock8aRouteResponse: QueryResponse8a = {
  items: [
    {
      areaName: '',
      areaSlug: '',
      averageRating: 1,
      category: 1,
      countryName: '',
      countrySlug: '',
      cragName: 'Test Crag',
      cragSlug: '',
      difficulty: '7A',
      flashOnsightRate: 1,
      gradeIndex: 1,
      score: 1,
      sectorName: '',
      sectorSlug: '',
      totalAscents: 1,
      totalRecommendedRate: 1,
      type: 1,
      zlaggableId: 456,
      zlaggableName: 'Test Route',
      zlaggableSlug: 'test-route',
    },
  ],
}

// Setup mocks
beforeEach(() => {
  // Mock global fetch
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('27crags Handler', () => {
  const externalRoute = {
    ...mock27cragsRouteResponse.search_keys.at(0),
    externalResourcesFk: -1,
    id: -1,
    regionFk: -1,
    url: `https://27crags.com/${mock27cragsRouteResponse.search_keys.at(0)?.path}`,
  } as unknown as RouteExternalResource27crags

  it('should query route information', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mock27cragsRouteResponse),
    } as Response)

    const result = await handler27crags.query('Test Route', 1, 'Test Crag', 'Test Sector', mockUserSettings)
    expect(result).toEqual(externalRoute)
  })

  it('should convert external data to route format', () => {
    const result = handler27crags.convertToRoute(externalRoute, mockGrades)
    expect(result).toMatchObject({
      name: 'Test Route',
      gradeFk: null,
    })
  })

  it('should handle ascent logging', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 302,
      text: () => Promise.resolve(''),
    } as Response)

    const mockAscent: Ascent = {
      createdAt: new Date(),
      createdBy: 1,
      dateTime: new Date().toISOString(),
      gradeFk: 1,
      humidity: null,
      id: 1,
      notes: null,
      rating: null,
      regionFk: 1,
      routeFk: 1,
      temperature: null,
      type: 'flash',
    }
    const mockSession = { username: 'test-user' }

    await expect(
      handler27crags.logAscent(mockAscent, 1, mockUserSettings, mockSession, mockLocals),
    ).resolves.not.toThrow()
  })
})

describe('8a Handler', () => {
  const externalRoute = {
    ...mock8aRouteResponse.items.at(0),
    externalResourcesFk: -1,
    id: -1,
    regionFk: -1,
    url: `https://www.8a.nu/crags/bouldering///sectors//routes/${mock8aRouteResponse.items.at(0)?.zlaggableSlug}`,
  } as unknown as RouteExternalResource8a

  it('should query route information', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mock8aRouteResponse),
    } as Response)

    const result = await handler8a.query('Test Route', 1, 'Test Crag', 'Test Sector', mockUserSettings)
    expect(result).toEqual(externalRoute)
  })

  it('should convert external data to route format', () => {
    const result = handler8a.convertToRoute(externalRoute, mockGrades)
    expect(result).toMatchObject({
      gradeFk: 2,
      name: 'Test Route',
    })
  })

  it('should handle session check', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 400,
      json: () => Promise.resolve(true),
    } as Response)

    const result = await handler8a.checkSession(1, mockUserSettings, mockLocals)
    expect(result).toBe(true)
  })

  it('should handle ascent logging', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response)

    const mockAscent: Ascent = {
      createdAt: new Date(),
      createdBy: 1,
      dateTime: new Date().toISOString(),
      gradeFk: 1,
      humidity: null,
      id: 1,
      notes: null,
      rating: null,
      regionFk: 1,
      routeFk: 1,
      temperature: null,
      type: 'flash',
    }

    await expect(handler8a.logAscent(mockAscent, 1, mockUserSettings, true, mockLocals)).resolves.not.toThrow()
  })
})

describe('TheCrag Handler', () => {
  const externalResource: RouteExternalResourceTheCrag = {
    name: 'Test Route',
    id: -1,
    description: 'Test Description',
    url: 'https://www.thecrag.com/route/123',
    externalResourcesFk: -1,
    rating: 2,
    grade: '7A',
    node: 123,
    tags: 'test,route',
    regionFk: -1,
  }

  it('should query route information', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          '<table class=routetable><tr data-nodename="Test Route" data-nid=123><td><div class=route><a title="Test Crag"></a><div class=star></div><div class=star></div><div class=pull-right>7A</div><div class=markdown><p>Test Description</p><div class=tags>test,route</div></div></div></td></tr></table>',
        ),
    } as Response)

    const result = await handlerTheCrag.query('Test Route', 1, 'Test Crag', 'Test Sector', mockUserSettings)
    expect(result).toEqual(externalResource)
  })

  it('should convert external data to route format', () => {
    const result = handlerTheCrag.convertToRoute(externalResource, mockGrades)
    expect(result).toMatchObject({
      name: 'Test Route',
      gradeFk: 2,
    })
  })

  it('should handle session check', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 400,
      json: () => Promise.resolve({ authAccountID: 'test-user' }),
    } as Response)

    const result = await handlerTheCrag.checkSession(1, mockUserSettings, mockLocals)
    expect(result).toBeDefined()
  })

  it('should handle ascent logging', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response)

    const mockAscent: Ascent = {
      createdAt: new Date(),
      createdBy: 1,
      dateTime: new Date().toISOString(),
      gradeFk: 1,
      humidity: null,
      id: 1,
      notes: null,
      rating: null,
      regionFk: 1,
      routeFk: 1,
      temperature: null,
      type: 'flash',
    }
    const mockSession = { account: 'test-user' }

    await expect(
      handlerTheCrag.logAscent(mockAscent, 1, mockUserSettings, mockSession, mockLocals),
    ).resolves.not.toThrow()
  })
})
