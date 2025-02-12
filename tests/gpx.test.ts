import * as schema from '$lib/db/schema'
import { getAreaGPX } from '$lib/gpx.server'
import type { Session } from '@supabase/supabase-js'
import { render } from '@testing-library/svelte'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  query: {
    grades: {
      findMany: vi.fn(() => []),
    },
    areas: {
      findMany: vi.fn(() => [
        {
          createdAt: '2024-12-10 14:01:52.606196+00',
          id: 574,
          createdBy: 3,
          name: 'blabla12',
          slug: 'blabla12',
          description: '',
          type: 'area',
          parentFk: null,
          author: {
            createdAt: '2024-12-09 11:20:32.107367+00',
            id: 3,
            username: 'maintainer',
            authUserFk: '84e21bf0-a335-4355-88a5-4079abf8d0ce',
            userSettingsFk: 2,
          },
          blocks: [],
          areas: [
            {
              createdAt: '2024-12-10 14:29:22.054461+00',
              id: 575,
              createdBy: 3,
              name: 'test',
              slug: 'test',
              description: '',
              type: 'crag',
              parentFk: 574,
              blocks: [
                {
                  createdAt: '2024-12-10 16:04:19.71053+00',
                  id: 1179,
                  createdBy: 3,
                  name: 'cool12',
                  slug: 'cool12',
                  areaFk: 575,
                  geolocationFk: 914,
                  area: {
                    createdAt: '2024-12-10 14:29:22.054461+00',
                    id: 575,
                    createdBy: 3,
                    name: 'test',
                    slug: 'test',
                    description: '',
                    type: 'crag',
                    parentFk: 574,
                    parent: {
                      createdAt: '2024-12-10 14:01:52.606196+00',
                      id: 574,
                      createdBy: 3,
                      name: 'blabla12',
                      slug: 'blabla12',
                      description: '',
                      type: 'area',
                      parentFk: null,
                      parent: null,
                    },
                  },
                  geolocation: {
                    id: 914,
                    lat: 47.6575,
                    long: 3.45578,
                    areaFk: null,
                    blockFk: 1179,
                  },
                  routes: [
                    {
                      createdAt: '2024-12-10 16:07:35.560339+00',
                      id: 5344,
                      createdBy: 3,
                      name: 'nice route',
                      slug: 'nice-route',
                      description: '',
                      rating: null,
                      blockFk: 1179,
                      firstAscentFk: null,
                      externalResourcesFk: null,
                      gradeFk: null,
                      firstAscents: [],
                      tags: [
                        {
                          routeFk: 5344,
                          tagFk: 'SD',
                        },
                      ],
                    },
                    {
                      createdAt: '2024-12-10 16:10:43.076149+00',
                      id: 5345,
                      createdBy: 3,
                      name: 'nice route1',
                      slug: 'nice-route1',
                      description: '',
                      rating: null,
                      blockFk: 1179,
                      firstAscentFk: null,
                      externalResourcesFk: null,
                      gradeFk: null,
                      firstAscents: [],
                      tags: [
                        {
                          routeFk: 5345,
                          tagFk: 'SD',
                        },
                      ],
                    },
                    {
                      createdAt: '2024-12-19 10:34:33.902523+00',
                      id: 5347,
                      createdBy: 3,
                      name: 'test',
                      slug: 'test',
                      description: 'qwe',
                      rating: 2,
                      blockFk: 1179,
                      firstAscentFk: 4647,
                      externalResourcesFk: 280,
                      gradeFk: 3,
                      firstAscents: [
                        {
                          firstAscensionist: {
                            id: 4647,
                            name: 'q',
                          },
                        },
                      ],
                      tags: [
                        {
                          routeFk: 5347,
                          tagFk: 'high',
                        },
                        {
                          routeFk: 5347,
                          tagFk: 'SD',
                        },
                      ],
                    },
                    {
                      createdAt: '2024-12-10 16:33:17.197967+00',
                      id: 5346,
                      createdBy: 3,
                      name: 'nice route 2',
                      slug: 'nice-route-2',
                      description: '**strong** *italic*',
                      rating: 3,
                      blockFk: 1179,
                      firstAscentFk: null,
                      externalResourcesFk: null,
                      gradeFk: 6,
                      firstAscents: [],
                      tags: [
                        {
                          routeFk: 5346,
                          tagFk: 'SD',
                        },
                      ],
                    },
                  ],
                  topos: [
                    {
                      id: 225,
                      blockFk: 1179,
                      fileFk: 474,
                      file: {
                        id: 474,
                        path: '/topos/hoher-fels/20240614_174848.jpg',
                        type: 'topo',
                        areaFk: null,
                        ascentFk: null,
                        routeFk: null,
                        blockFk: 1179,
                      },
                      routes: [
                        {
                          id: 384,
                          topType: 'top',
                          path: 'M265,574 L412,208 Z',
                          routeFk: 5347,
                          topoFk: 225,
                        },
                      ],
                    },
                  ],
                },
              ],
              areas: [],
              parkingLocations: [
                {
                  id: 913,
                  lat: 49.3523,
                  long: 1.77686,
                  areaFk: 575,
                  blockFk: null,
                },
              ],
            },
            {
              createdAt: '2024-12-16 12:08:59.524904+00',
              id: 577,
              createdBy: 3,
              name: 'test2',
              slug: 'test2',
              description: '',
              type: 'area',
              parentFk: 574,
              blocks: [],
              areas: [],
              parkingLocations: [],
            },
          ],
          parkingLocations: [],
        },
      ]),
    },
    users: {
      findFirst: vi.fn(() => ({}) as schema.User),
    },
  },
} as unknown as PostgresJsDatabase<typeof schema>

const mockSession = {
  user: {
    id: 'test-user',
  },
} as unknown as Session

describe('GPX Generation', () => {
  beforeEach(() => {
    vi.mock('svelte/server', () => ({
      render: vi.fn((component: Parameters<typeof render>[0], props: Parameters<typeof render>[1]) => ({
        body: render(component, props).baseElement.innerHTML,
      })),
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should generate GPX file with correct metadata', async () => {
    const gpxContent = await getAreaGPX(1, mockDb, mockSession)
    expect(gpxContent).toContain("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>")
    expect(gpxContent).toContain('<metadata>')
    expect(gpxContent).toContain('<name>blabla12</name>')
  })

  it('should include block information in GPX file', async () => {
    const gpxContent = await getAreaGPX(1, mockDb, mockSession)
    expect(gpxContent).toContain('<wpt lat="47.6575" lon="3.45578">')
    expect(gpxContent).toContain('<name>nice route</name>')
  })

  it('should handle markdown conversion in descriptions', async () => {
    const gpxContent = await getAreaGPX(1, mockDb, mockSession)
    expect(gpxContent).toContain('&lt;strong&gt;strong&lt;/strong&gt;')
    expect(gpxContent).toContain('&lt;em&gt;italic&lt;/em&gt;')
  })

  it('should handle database errors gracefully', async () => {
    const _mockDb = {
      ...mockDb,
      query: {
        areas: {
          findMany: vi.fn().mockRejectedValue(new Error('Database error')),
        },
      },
    } as unknown as PostgresJsDatabase<typeof schema>

    expect(getAreaGPX(1, _mockDb, mockSession)).rejects.toThrowError()
  })
})
