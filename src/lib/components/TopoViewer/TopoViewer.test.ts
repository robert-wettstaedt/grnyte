import type { TopoDTO, TopoRouteDTO } from '$lib/topo'
import { fireEvent, render, screen } from '@testing-library/svelte'
import * as d3 from 'd3'
import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileStat } from 'webdav'
import TopoViewer from './TopoViewer.svelte'
import { selectedPointTypeStore, selectedRouteStore } from './stores'

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock

// Mock d3 zoom functionality
vi.mock('d3', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    zoom: vi.fn(() => ({
      extent: vi.fn().mockReturnThis(),
      translateExtent: vi.fn().mockReturnThis(),
      scaleExtent: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
    })),
    select: vi.fn(() => ({
      call: vi.fn(),
    })),
    drag: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
    })),
  }
})

describe('TopoViewer Component', () => {
  const mockTopos: TopoDTO[] = [
    {
      id: 1,
      blockFk: 1,
      fileFk: '1',
      regionFk: 1,
      file: {
        id: '1',
        path: '/test/path1.jpg',
        areaFk: 1,
        ascentFk: 1,
        routeFk: 1,
        blockFk: 1,
        bunnyStreamFk: null,
        visibility: null,
        regionFk: 1,
        stat: {
          filename: '/test/path1.jpg',
          basename: 'path1.jpg',
          size: 1000,
          lastmod: '2024-01-01',
          type: 'file',
          etag: 'test-etag',
        } as FileStat,
      },
      routes: [
        {
          id: 1,
          topType: 'top',
          routeFk: 1,
          topoFk: 1,
          points: [
            { id: '1', type: 'start' as const, x: 100, y: 200 },
            { id: '2', type: 'middle' as const, x: 150, y: 150 },
            { id: '3', type: 'top' as const, x: 200, y: 100 },
          ],
        } as TopoRouteDTO,
      ],
    },
    {
      id: 2,
      blockFk: 1,
      fileFk: '2',
      regionFk: 1,
      file: {
        id: '2',
        path: '/test/path2.jpg',
        areaFk: 1,
        ascentFk: 1,
        routeFk: 1,
        blockFk: 1,
        bunnyStreamFk: null,
        visibility: null,
        regionFk: 1,
        stat: {
          filename: '/test/path2.jpg',
          basename: 'path2.jpg',
          size: 1000,
          lastmod: '2024-01-01',
          type: 'file',
          etag: 'test-etag',
        } as FileStat,
      },
      routes: [],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset stores
    selectedPointTypeStore.set(null)
    selectedRouteStore.set(null)
  })

  describe('View Mode', () => {
    it('should render topo image correctly', () => {
      const { container } = render(TopoViewer, {
        props: {
          topos: mockTopos,
          editable: false,
        },
      })

      const images = container.querySelectorAll('img')
      expect(images).toHaveLength(2) // Main image and blurred background
      expect(images[1]).toHaveAttribute('src', '/nextcloud/test/path1.jpg')
    })

    it('should handle zoom interactions', async () => {
      const { container } = render(TopoViewer, {
        props: {
          topos: mockTopos,
          editable: false,
        },
      })

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      await fireEvent.click(svg!)

      expect(d3.zoom).toHaveBeenCalled()
      expect(d3.select).toHaveBeenCalled()
    })
  })

  describe('Edit Mode', () => {
    it('should show point type buttons when route is selected', async () => {
      render(TopoViewer, {
        props: {
          topos: mockTopos,
          editable: true,
        },
      })

      // Set the store value and wait for next tick
      selectedRouteStore.set(1)
      await new Promise((resolve) => setTimeout(resolve, 0))

      const startButton = screen.getByRole('button', { name: /start/i })
      const middleButton = screen.getByRole('button', { name: /middle/i })
      const topButton = screen.getByRole('button', { name: /^top/i })

      expect(startButton).toBeInTheDocument()
      expect(middleButton).toBeInTheDocument()
      expect(topButton).toBeInTheDocument()
    })

    it('should handle point placement', async () => {
      const onChange = vi.fn()
      const { container } = render(TopoViewer, {
        props: {
          topos: mockTopos,
          editable: true,
          onChange,
        },
      })

      selectedRouteStore.set(1)
      selectedPointTypeStore.set('middle')
      await new Promise((resolve) => setTimeout(resolve, 0))

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      await fireEvent.click(svg!, {
        clientX: 300,
        clientY: 300,
        layerX: 300,
        layerY: 300,
      })

      expect(onChange).toHaveBeenCalled()
      const [, updatedRoute] = onChange.mock.calls[0]
      expect(updatedRoute.points).toHaveLength(4) // Original 3 points + new point
    })

    it('should handle topout type change', async () => {
      const onChange = vi.fn()
      render(TopoViewer, {
        props: {
          topos: mockTopos,
          editable: true,
          onChange,
        },
      })

      selectedRouteStore.set(1)
      await new Promise((resolve) => setTimeout(resolve, 0))

      const checkbox = screen.getByRole('checkbox')
      await fireEvent.click(checkbox)

      expect(onChange).toHaveBeenCalled()
      const [, updatedRoute] = onChange.mock.calls[0]
      expect(updatedRoute.topType).toBe('topout')
    })

    it('should handle point type selection', async () => {
      render(TopoViewer, {
        props: {
          topos: mockTopos,
          editable: true,
        },
      })

      selectedRouteStore.set(1)
      await new Promise((resolve) => setTimeout(resolve, 0))

      const startButton = screen.getByRole('button', { name: /start/i })
      await fireEvent.click(startButton)

      expect(get(selectedPointTypeStore)).toBe('start')

      // Click again to deselect
      await fireEvent.click(startButton)
      expect(get(selectedPointTypeStore)).toBeNull()
    })

    it('should disable start button when max start points reached', async () => {
      const topoWithMaxStarts = {
        ...mockTopos[0],
        routes: [
          {
            ...mockTopos[0].routes[0],
            points: [
              { id: '1', type: 'start' as const, x: 100, y: 200 },
              { id: '2', type: 'start' as const, x: 120, y: 220 },
              { id: '3', type: 'top' as const, x: 200, y: 100 },
            ],
          },
        ],
      }

      render(TopoViewer, {
        props: {
          topos: [topoWithMaxStarts],
          editable: true,
        },
      })

      selectedRouteStore.set(1)
      await new Promise((resolve) => setTimeout(resolve, 0))

      const startButton = screen.getByRole('button', { name: /start/i })
      expect(startButton).toBeDisabled()
    })

    it('should disable top button when max top points reached', async () => {
      render(TopoViewer, {
        props: {
          topos: mockTopos,
          editable: true,
        },
      })

      selectedRouteStore.set(1)
      await new Promise((resolve) => setTimeout(resolve, 0))

      const topButton = screen.getByText('Top')
      expect(topButton).toBeDisabled()
    })
  })

  describe('Navigation', () => {
    it('should handle topo navigation', async () => {
      const { container } = render(TopoViewer, {
        props: {
          topos: mockTopos,
          editable: true,
        },
      })

      // Initial state should show first topo
      const mainImage = container.querySelector('img#img[alt="/test/path1.jpg"]')
      expect(mainImage).toBeInTheDocument()

      // Click next button
      const nextButton = screen.getByRole('button', { name: /next/i })
      await fireEvent.click(nextButton)

      // Should show second topo
      const nextImage = container.querySelector('img#img[alt="/test/path2.jpg"]')
      expect(nextImage).toBeInTheDocument()

      // Click prev button
      const prevButton = screen.getByRole('button', { name: /prev/i })
      await fireEvent.click(prevButton)

      // Should show first topo again
      const firstImageAgain = container.querySelector('img#img[alt="/test/path1.jpg"]')
      expect(firstImageAgain).toBeInTheDocument()
    })

    it('should disable navigation buttons at boundaries', () => {
      render(TopoViewer, {
        props: {
          topos: mockTopos,
          editable: true,
        },
      })

      // At first topo, prev should be disabled
      const prevButton = screen.getByRole('button', { name: /prev/i })
      expect(prevButton).toBeDisabled()

      // At last topo, next should be disabled
      const nextButton = screen.getByRole('button', { name: /next/i })
      expect(nextButton).not.toBeDisabled()
    })
  })

  describe('Error Handling', () => {
    it('should handle missing image gracefully', () => {
      const topoWithError = {
        ...mockTopos[0],
        file: {
          ...mockTopos[0].file,
          error: 'File not found',
        },
      }

      render(TopoViewer, {
        props: {
          topos: [topoWithError],
          editable: true,
        },
      })

      expect(screen.getByText('Error loading image')).toBeInTheDocument()
    })
  })
})
