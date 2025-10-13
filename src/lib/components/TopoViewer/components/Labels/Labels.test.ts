import type { TopoRouteDTO } from '$lib/topo'
import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import Labels from './Labels.svelte'

describe('Labels Component', () => {
  const mockRoutes: TopoRouteDTO[] = [
    {
      id: 1,
      topType: 'top',
      routeFk: 1,
      topoFk: 1,
      regionFk: 1,
      route: {
        id: 1,
        name: 'Route 1',
        slug: 'route-1',
        createdAt: 0,
        description: 'Route 1 description',
        createdBy: 1,
        gradeFk: 1,
        rating: 1,
        firstAscentYear: 2021,
        blockFk: 1,
        externalResourcesFk: 1,
        areaFks: [],
        areaIds: '',
        userRating: null,
        userGradeFk: null,
        regionFk: 1,
      },
      points: [
        { id: '1', type: 'start', x: 100, y: 200 },
        { id: '2', type: 'middle', x: 150, y: 150 },
        { id: '3', type: 'top', x: 200, y: 100 },
      ],
    },
    {
      id: 2,
      topType: 'topout',
      routeFk: 2,
      topoFk: 1,
      regionFk: 1,
      route: {
        id: 1,
        name: 'Route 1',
        slug: 'route-1',
        createdAt: 0,
        description: 'Route 1 description',
        createdBy: 1,
        gradeFk: 1,
        rating: 1,
        firstAscentYear: 2021,
        blockFk: 1,
        externalResourcesFk: 1,
        areaFks: [],
        areaIds: '',
        userRating: null,
        userGradeFk: null,
        regionFk: 1,
      },
      points: [
        { id: '4', type: 'start', x: 300, y: 200 },
        { id: '5', type: 'top', x: 350, y: 100 },
      ],
    },
  ]

  describe('Rendering', () => {
    it('should render labels for each route', () => {
      const { container } = render(Labels, {
        props: {
          routes: mockRoutes,
          scale: 1,
          getRouteKey: (route) => route.routeFk ?? 0,
        },
      })

      const labels = container.querySelectorAll('div[style*="position: absolute"]')
      expect(labels.length).toBe(2) // One label per start point (2 routes with different start points)
    })

    it('should position labels based on route points', () => {
      const { container } = render(Labels, {
        props: {
          routes: [mockRoutes[0]], // Using only first route
          scale: 1,
          getRouteKey: (route) => route.routeFk ?? 0,
        },
      })

      const label = container.querySelector('div[style*="position: absolute"]')
      expect(label).not.toBeNull()
      expect(label?.getAttribute('style')).toContain('left: 100px')
      expect(label?.getAttribute('style')).toContain('top: 240px') // y + 40 for start points
    })

    it('should handle custom route keys', () => {
      const { container } = render(Labels, {
        props: {
          routes: mockRoutes,
          scale: 1,
          getRouteKey: (route) => (route.routeFk ?? 0) * 10,
        },
      })

      const label = container.querySelector('div[style*="position: absolute"]')
      expect(label?.textContent?.trim()).toBe('10')
    })

    it('should handle missing getRouteKey', () => {
      const { container } = render(Labels, {
        props: {
          routes: mockRoutes,
          scale: 1,
        },
      })

      const labels = container.querySelectorAll('div[style*="position: absolute"]')
      expect(labels.length).toBe(0)
    })
  })

  describe('Scaling', () => {
    it('should apply scale to label positions', () => {
      const scale = 2
      const { container } = render(Labels, {
        props: {
          routes: mockRoutes,
          scale,
          getRouteKey: (route) => route.routeFk ?? 0,
        },
      })

      const label = container.querySelector('div[style*="position: absolute"]')
      expect(label).not.toBeNull()
      expect(label?.getAttribute('style')).toContain('left: 200px')
      expect(label?.getAttribute('style')).toContain('top: 480px')
    })
  })

  describe('Label Positioning', () => {
    it('should position labels at start points by default', () => {
      const { container } = render(Labels, {
        props: {
          routes: [mockRoutes[0]],
          scale: 1,
          getRouteKey: (route) => route.routeFk ?? 0,
        },
      })

      const label = container.querySelector('div[style*="position: absolute"]')
      expect(label).not.toBeNull()
      expect(label?.getAttribute('style')).toContain('left: 100px')
      expect(label?.getAttribute('style')).toContain('top: 240px')
    })

    it('should show both start and top labels when routes share start points', () => {
      const routesWithSharedStart = [
        mockRoutes[0],
        {
          ...mockRoutes[0],
          id: 3,
          routeFk: 3,
          points: [
            { id: '6', type: 'start', x: 100, y: 200 }, // Same start point as route 1
            { id: '7', type: 'top', x: 250, y: 100 },
          ],
        },
      ] as TopoRouteDTO[]

      const { container } = render(Labels, {
        props: {
          routes: routesWithSharedStart,
          scale: 1,
          getRouteKey: (route) => route.routeFk ?? 0,
        },
      })

      const labels = container.querySelectorAll('div[style*="position: absolute"]')
      expect(labels.length).toBe(3) // One for shared start, two for tops
      expect(labels[0]?.textContent?.trim()).toBe('1, 3') // Combined route keys for shared start
    })

    it('should handle routes without points', () => {
      const routeWithoutPoints = {
        ...mockRoutes[0],
        points: [],
      }

      const { container } = render(Labels, {
        props: {
          routes: [routeWithoutPoints],
          scale: 1,
          getRouteKey: (route) => route.routeFk ?? 0,
        },
      })

      const labels = container.querySelectorAll('div[style*="position: absolute"]')
      expect(labels.length).toBe(0)
    })
  })
})
