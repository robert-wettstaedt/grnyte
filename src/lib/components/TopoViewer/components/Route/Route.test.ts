import { selectedPointTypeStore, selectedRouteStore } from '$lib/components/TopoViewer/stores'
import type { TopoRouteDTO } from '$lib/topo'
import { fireEvent, render } from '@testing-library/svelte'
import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RouteView from './Route.svelte'

// Mock d3 functionality
vi.mock('d3', () => {
  interface DragEvent {
    dx: number
    dy: number
    sourceEvent: {
      preventDefault: () => void
      target?: {
        attributes: {
          getNamedItem: (name: string) => { value: string } | null
        }
      }
      type: string
    }
  }

  interface DragBehavior {
    on: (event: string, handler: (event: DragEvent) => void) => DragBehavior
    dragHandler?: (event: DragEvent) => void
    subject: () => DragBehavior
  }

  const dragBehavior: DragBehavior = {
    on: vi.fn((event: string, handler: (event: DragEvent) => void) => {
      if (event === 'drag') {
        dragBehavior.dragHandler = handler
      }
      return dragBehavior
    }),
    subject: vi.fn().mockReturnThis(),
  }

  interface D3Selection {
    call: (drag: unknown) => void
    _drag?: unknown
  }

  return {
    select: vi.fn((element: Element) => {
      const selection: D3Selection = {
        call: (drag: unknown) => {
          ;(element as unknown as D3Selection)._drag = drag
        },
      }
      return selection
    }),
    drag: vi.fn(() => dragBehavior),
  }
})

describe('RouteView Component', () => {
  const mockRoute: TopoRouteDTO = {
    id: 1,
    topType: 'top',
    routeFk: 1,
    topoFk: 1,
    route: {
      id: 1,
      name: 'Test Route',
      slug: 'test-route',
      createdAt: '2021-01-01',
      description: 'Test Description',
      createdBy: 1,
      gradeFk: 1,
      rating: 4.5,
      firstAscentYear: 2020,
      blockFk: 1,
      externalResourcesFk: 1,
      areaFks: [],
      userRating: null,
      userGradeFk: null,
    },
    points: [
      { id: '1', type: 'start', x: 100, y: 200 },
      { id: '2', type: 'middle', x: 150, y: 150 },
      { id: '3', type: 'top', x: 200, y: 100 },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    selectedPointTypeStore.set(null)
    selectedRouteStore.set(null)
  })

  describe('Rendering', () => {
    it('should render route lines correctly', () => {
      const { container } = render(RouteView, {
        props: {
          route: mockRoute,
          editable: false,
          height: 400,
          width: 600,
          scale: 1,
        },
      })

      const lines = container.querySelectorAll('line[data-id="line"]')
      // Each connection between points has 2 lines (background and foreground)
      expect(lines.length).toBe(4) // 2 connections * 2 lines
      expect(lines[0].getAttribute('data-route-id')).toBe('1')
    })

    it('should render points when route is selected', async () => {
      const { container } = render(RouteView, {
        props: {
          route: mockRoute,
          editable: true,
          height: 400,
          width: 600,
          scale: 1,
        },
      })

      selectedRouteStore.set(1)
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Start point has 3 circles, middle has 2, top has 2 lines
      const circles = container.querySelectorAll('circle')
      expect(circles.length).toBe(5)
    })

    it('should style points based on type', async () => {
      const { container } = render(RouteView, {
        props: {
          route: mockRoute,
          editable: true,
          height: 400,
          width: 600,
          scale: 1,
        },
      })

      selectedRouteStore.set(1)
      await new Promise((resolve) => setTimeout(resolve, 0))

      const startPoint = container.querySelector('#start')
      const middlePoint = container.querySelector('#middle')
      const topPoint = container.querySelector('#top-bg')

      expect(startPoint).not.toBeNull()
      expect(middlePoint).not.toBeNull()
      expect(topPoint).not.toBeNull()
    })
  })

  describe('Interactions', () => {
    it('should handle point dragging', async () => {
      const onChange = vi.fn()
      const { container } = render(RouteView, {
        props: {
          route: mockRoute,
          editable: true,
          height: 400,
          width: 600,
          scale: 1,
          onChange,
        },
      })

      selectedRouteStore.set(1)
      await new Promise((resolve) => setTimeout(resolve, 0))

      const group = container.querySelector('g')
      expect(group).not.toBeNull()

      // Get the d3 drag behavior
      type MockDragBehavior = {
        dragHandler?: (event: DragEvent) => void
        on: (event: string, handler: (event: DragEvent) => void) => MockDragBehavior
      }

      const typedGroup = group as unknown as { _drag: MockDragBehavior }
      const dragBehavior = typedGroup._drag
      expect(dragBehavior).toBeDefined()

      // Simulate drag event
      dragBehavior.dragHandler?.({ x: 10, y: 10 } as unknown as DragEvent)

      expect(onChange).toHaveBeenCalled()
    })

    it('should handle point deletion', async () => {
      const onChange = vi.fn()
      const { container } = render(RouteView, {
        props: {
          route: mockRoute,
          editable: true,
          height: 400,
          width: 600,
          scale: 1,
          onChange,
        },
      })

      selectedRouteStore.set(1)
      await new Promise((resolve) => setTimeout(resolve, 0))

      const point = container.querySelector('#start')
      expect(point).not.toBeNull()

      // Simulate right click
      await fireEvent.contextMenu(point!)

      expect(onChange).toHaveBeenCalled()
      const updatedRoute = onChange.mock.calls[0][0]
      expect(updatedRoute.points).toHaveLength(2)
    })

    it('should handle route selection', async () => {
      const { container } = render(RouteView, {
        props: {
          route: mockRoute,
          editable: true,
          height: 400,
          width: 600,
          scale: 1,
        },
      })

      const group = container.querySelector('g')
      expect(group).not.toBeNull()

      // Simulate drag start event to trigger selection
      type DragMock = {
        on: {
          mock: {
            calls: Array<
              [
                string,
                (event: {
                  sourceEvent: {
                    preventDefault: () => void
                    target: { attributes: { getNamedItem: () => { value: string } } }
                    type: string
                  }
                }) => void,
              ]
            >
          }
        }
      }

      const typedGroup = group as unknown as { _drag: DragMock }
      const dragBehavior = typedGroup._drag
      expect(dragBehavior).toBeDefined()

      const startHandler = dragBehavior.on.mock.calls.find(([event]) => event === 'start')?.[1]
      if (startHandler) {
        startHandler({
          sourceEvent: {
            preventDefault: vi.fn(),
            target: { attributes: { getNamedItem: () => ({ value: '1' }) } },
            type: '',
          },
        })
      }

      expect(get(selectedRouteStore)).toBe(1)
    })
  })

  describe('Styling', () => {
    it('should apply selected styles when route is selected', async () => {
      const { container } = render(RouteView, {
        props: {
          route: mockRoute,
          editable: true,
          height: 400,
          width: 600,
          scale: 1,
        },
      })

      const lines = container.querySelectorAll('line[data-id="line"]')
      expect(lines.length).toBeGreaterThan(0)
      const foregroundLine = Array.from(lines).find((line) => line.getAttribute('opacity') === null)
      expect(foregroundLine).not.toBeNull()

      selectedRouteStore.set(1)
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(foregroundLine?.getAttribute('stroke')).toBe('white')
    })

    it('should handle different top types', () => {
      const routeWithTopout = {
        ...mockRoute,
        topType: 'topout' as const,
      }

      const { container } = render(RouteView, {
        props: {
          route: routeWithTopout,
          editable: true,
          height: 400,
          width: 600,
          scale: 1,
        },
      })

      const topout = container.querySelector('#topout')
      expect(topout).not.toBeNull()
    })
  })
})
