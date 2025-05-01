import type { Area } from '$lib/db/schema'
import type { NestedArea, NestedBlock, NestedRoute } from '$lib/db/types'
import {
  buildNestedAreaQuery,
  enrichArea,
  enrichBlock,
  enrichRoute,
  type EnrichedArea,
  type EnrichedBlock,
} from '$lib/db/utils'
import { describe, expect, it } from 'vitest'

describe('buildNestedAreaQuery', () => {
  it('should build a nested area query with the correct depth', () => {
    const query = buildNestedAreaQuery()
    expect(query).toEqual({
      with: {
        parent: {
          with: {
            parent: {
              with: {
                parent: {
                  with: {
                    parent: {
                      with: {
                        parent: true,
                        parkingLocations: true,
                      },
                    },
                    parkingLocations: true,
                  },
                },
                parkingLocations: true,
              },
            },
            parkingLocations: true,
          },
        },
        parkingLocations: true,
      },
    })
  })

  it('should build a nested area query with custom depth', () => {
    const query = buildNestedAreaQuery(2)
    expect(query).toEqual({
      with: {
        parent: {
          with: {
            parent: {
              with: {
                parent: true,
                parkingLocations: true,
              },
            },
            parkingLocations: true,
          },
        },
        parkingLocations: true,
      },
    })
  })

  it('should build a nested area query with depth 0', () => {
    const query = buildNestedAreaQuery(0)
    expect(query).toEqual({
      with: {
        parent: true,
        parkingLocations: true,
      },
    })
  })
})

describe('enrichArea', () => {
  it('should enrich a NestedArea object with a pathname', () => {
    const area = {
      id: 1,
      slug: 'test-area',
      parent: null,
    } as unknown as NestedArea

    const enrichedArea = enrichArea(area)
    expect(enrichedArea.pathname).toBe('/areas/test-area-1')
  })

  it('should recursively enrich a NestedArea object with a pathname', () => {
    const area = {
      id: 1,
      slug: 'child-area',
      parent: {
        id: 2,
        slug: 'parent-area',
        parent: null,
      },
    } as unknown as NestedArea
    const enrichedArea = enrichArea(area)
    expect(enrichedArea.pathname).toBe('/areas/parent-area-2/child-area-1')
  })

  it('should handle deeply nested areas', () => {
    const area = {
      id: 1,
      slug: 'child-area',
      parent: {
        id: 2,
        slug: 'parent-area',
        parent: {
          id: 3,
          slug: 'grandparent-area',
          parent: {
            id: 4,
            slug: 'great-grandparent-area',
            parent: null,
          },
        },
      },
    } as unknown as NestedArea
    const enrichedArea = enrichArea(area)
    expect(enrichedArea.pathname).toBe('/areas/great-grandparent-area-4/grandparent-area-3/parent-area-2/child-area-1')
  })

  it('should preserve all area properties when enriching', () => {
    const area = {
      id: 1,
      slug: 'test-area',
      parent: null,
      name: 'Test Area',
      type: 'crag',
      createdAt: new Date().toISOString(),
    } as unknown as NestedArea

    const enrichedArea = enrichArea(area)
    expect(enrichedArea).toEqual({
      ...area,
      pathname: '/areas/test-area-1',
    })
  })
})

describe('enrichBlock', () => {
  it('should enrich a NestedBlock object with a pathname and enriched area', () => {
    const block = {
      id: 1,
      slug: 'test-block',
      area: {
        id: 2,
        slug: 'test-area',
        parent: null,
      },
    } as unknown as NestedBlock

    const enrichedBlock = enrichBlock(block)
    expect(enrichedBlock.pathname).toBe('/areas/test-area-2/_/blocks/test-block')
    expect((enrichedBlock.area as EnrichedArea).pathname).toBe('/areas/test-area-2')
  })

  it('should handle blocks in nested areas', () => {
    const block = {
      id: 1,
      slug: 'test-block',
      area: {
        id: 2,
        slug: 'child-area',
        parent: {
          id: 3,
          slug: 'parent-area',
          parent: null,
        },
      },
    } as unknown as NestedBlock

    const enrichedBlock = enrichBlock(block)
    expect(enrichedBlock.pathname).toBe('/areas/parent-area-3/child-area-2/_/blocks/test-block')
    expect((enrichedBlock.area as EnrichedArea).pathname).toBe('/areas/parent-area-3/child-area-2')
  })

  it('should preserve all block properties when enriching', () => {
    const block = {
      id: 1,
      slug: 'test-block',
      name: 'Test Block',
      description: 'Test Description',
      createdAt: new Date().toISOString(),
      area: {
        id: 2,
        slug: 'test-area',
        parent: null,
      },
    } as unknown as NestedBlock

    const enrichedBlock = enrichBlock(block)
    expect(enrichedBlock).toEqual({
      ...block,
      pathname: '/areas/test-area-2/_/blocks/test-block',
      area: {
        ...block.area,
        pathname: '/areas/test-area-2',
      },
    })
  })
})

describe('enrichRoute', () => {
  it('should enrich a NestedRoute object with a pathname and enriched block', () => {
    const route: NestedRoute = {
      id: 1,
      slug: 'test-route',
      block: {
        id: 2,
        slug: 'test-block',
        area: {
          id: 3,
          slug: 'test-area',
          parent: null,
        },
      },
    } as unknown as NestedRoute

    const enrichedRoute = enrichRoute(route)
    expect(enrichedRoute.pathname).toBe('/areas/test-area-3/_/blocks/test-block/routes/test-route')
    expect((enrichedRoute.block as EnrichedBlock).pathname).toBe('/areas/test-area-3/_/blocks/test-block')
    expect((enrichedRoute.block.area as EnrichedArea).pathname).toBe('/areas/test-area-3')
  })

  it('should handle routes in blocks in nested areas', () => {
    const route = {
      id: 1,
      slug: 'test-route',
      block: {
        id: 2,
        slug: 'test-block',
        area: {
          id: 3,
          slug: 'child-area',
          parent: {
            id: 4,
            slug: 'parent-area',
          },
        },
      },
    } as unknown as NestedRoute

    const enrichedRoute = enrichRoute(route)
    expect(enrichedRoute.pathname).toBe('/areas/parent-area-4/child-area-3/_/blocks/test-block/routes/test-route')
    expect((enrichedRoute.block as EnrichedBlock).pathname).toBe(
      '/areas/parent-area-4/child-area-3/_/blocks/test-block',
    )
    expect((enrichedRoute.block.area as EnrichedArea).pathname).toBe('/areas/parent-area-4/child-area-3')
  })

  it('should preserve all route properties when enriching', () => {
    const route = {
      id: 1,
      slug: 'test-route',
      name: 'Test Route',
      description: 'Test Description',
      gradeFk: 1,
      createdAt: new Date().toISOString(),
      block: {
        id: 2,
        slug: 'test-block',
        area: {
          id: 3,
          slug: 'test-area',
        } as Area,
      } as NestedBlock,
    } as unknown as NestedRoute

    const enrichedRoute = enrichRoute(route)
    expect(enrichedRoute).toEqual({
      ...route,
      pathname: '/areas/test-area-3/_/blocks/test-block/routes/test-route',
      block: {
        ...route.block,
        pathname: '/areas/test-area-3/_/blocks/test-block',
        area: {
          ...route.block.area,
          pathname: '/areas/test-area-3',
        },
      },
    })
  })
})
