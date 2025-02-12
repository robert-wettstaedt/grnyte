<script module lang="ts">
  export type Coordinates = Pick<PointDTO, 'x' | 'y'>

  export interface Line {
    from: Coordinates
    to: Coordinates
    length: number
  }
</script>

<script lang="ts">
  import { type PointDTO, type TopoRouteDTO } from '$lib/topo'
  import * as d3 from 'd3'
  import { onMount } from 'svelte'
  import { highlightedRouteStore, selectedPointTypeStore, selectedRouteStore } from '../../stores'
  import { calcLines } from './lib'

  interface Props {
    editable?: boolean
    onChange?: (route: TopoRouteDTO) => void
    route: TopoRouteDTO
    scale: number
    height: number
    width: number
  }

  let { editable = false, onChange, route = $bindable(), scale, height, width }: Props = $props()

  let group: SVGGElement | undefined = $state()

  let selected = $derived($selectedRouteStore === route.routeFk)
  let highlighted = $derived($highlightedRouteStore === route.routeFk)

  let cursorClass = $derived(selected && editable ? 'cursor-move' : 'cursor-pointer')

  let color = $derived(highlighted ? '#2ca02c' : selected ? 'white' : '#ff7f0e')
  let bgColor = 'black'
  let bgOpacity = 0.5

  let strokeWidth = $derived(highlighted || selected ? 4 : 2)
  let bgStrokeWidth = $derived(highlighted || selected ? 6 : 4)

  let selectedPoint: PointDTO | undefined = $state(undefined)

  let lines = $derived(calcLines(route.points))

  let longPressTimer: ReturnType<typeof setTimeout> | undefined = $state()
  let longPressCoords: Coordinates | undefined = $state()
  const LONG_PRESS_DURATION = 500

  function handleTouchStart(event: PointerEvent) {
    longPressTimer = setTimeout(() => {
      onContextMenu(event)
    }, LONG_PRESS_DURATION)
    longPressCoords = { x: event.clientX, y: event.clientY }
  }

  function handleTouchMove(event: PointerEvent) {
    if (longPressCoords) {
      const distance = Math.sqrt(
        Math.pow(event.clientX - longPressCoords.x, 2) + Math.pow(event.clientY - longPressCoords.y, 2),
      )

      if (distance > 8) {
        handleTouchEnd()
      }
    }
  }

  function handleTouchEnd() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = undefined
      longPressCoords = undefined
    }
  }

  const onContextMenu = (event: MouseEvent | PointerEvent) => {
    event.preventDefault()

    const target = event.target as HTMLElement
    const targetId = target.attributes.getNamedItem('data-id')?.value
    const point = route.points.find((point) => point.id === targetId)

    if (!selected || point == null || !editable) {
      return
    }

    route.points = route.points.filter((_point) => _point.id !== point.id)
    selectedPoint = undefined
    onChange?.(route)
  }

  onMount(() => {
    if (group != null) {
      const drag = d3
        .drag()
        .on('start', (event) => {
          const sourceEvent = event.sourceEvent as Event

          if (sourceEvent.type.startsWith('mouse')) {
            sourceEvent.preventDefault()
          }

          const targetId = (sourceEvent.target as Element).attributes.getNamedItem('data-id')?.value
          selectedPoint = route.points.find((point) => point.id === targetId)

          if (!selected && $selectedPointTypeStore == null) {
            selectedRouteStore.set(route.routeFk)
            highlightedRouteStore.set(null)
          }
        })
        .on('drag', (event) => {
          if (!editable) {
            return
          }

          const points = selectedPoint == null ? route.points : [selectedPoint]

          const correction = points.reduce(
            (r, point) => {
              const pos = {
                x: point.x + event.dx,
                y: point.y + event.dy,
              }
              const norm = {
                x: Math.min(Math.max(0, pos.x), width / scale),
                y: Math.min(Math.max(0, pos.y), height / scale),
              }
              const diff = {
                x: norm.x - pos.x,
                y: norm.y - pos.y,
              }
              return r == null
                ? diff
                : {
                    x: Math.abs(diff.x) > Math.abs(r.x) ? diff.x : r.x,
                    y: Math.abs(diff.y) > Math.abs(r.y) ? diff.y : r.y,
                  }
            },
            null as Coordinates | null,
          )

          points.forEach((point) => {
            point.x = Math.round(point.x + event.dx / scale + (correction?.x ?? 0))
            point.y = Math.round(point.y + event.dy / scale + (correction?.y ?? 0))
          })

          onChange?.(route)
        })
        .on('end', () => {
          selectedPoint = undefined
        })

      d3.select(group).call(drag as any)
    }
  })
</script>

<g
  bind:this={group}
  class="cursor-pointer select-none"
  oncontextmenu={onContextMenu}
  onpointerdown={handleTouchStart}
  onpointermove={handleTouchMove}
  onpointerup={handleTouchEnd}
  role="presentation"
>
  {#each lines as line}
    <line
      data-id="line"
      data-route-id={route.routeFk}
      opacity={bgOpacity}
      stroke-width={bgStrokeWidth}
      stroke={bgColor}
      x1={line.from.x * scale}
      x2={line.to.x * scale}
      y1={line.from.y * scale}
      y2={line.to.y * scale}
    />

    <line
      data-id="line"
      data-route-id={route.routeFk}
      stroke={color}
      stroke-width={strokeWidth}
      x1={line.from.x * scale}
      x2={line.to.x * scale}
      y1={line.from.y * scale}
      y2={line.to.y * scale}
    />
  {/each}

  {#each route.points as point}
    {#if point.type === 'start'}
      <circle
        class={cursorClass}
        cx={point.x * scale}
        cy={point.y * scale}
        data-id={point.id}
        data-route-id={route.routeFk}
        fill="transparent"
        id="start-bg-outer"
        opacity={bgOpacity}
        r={highlighted || selected ? 12 : 11}
        role="presentation"
        stroke={bgColor}
      />

      <circle
        class={cursorClass}
        cx={point.x * scale}
        cy={point.y * scale}
        data-id={point.id}
        data-route-id={route.routeFk}
        fill="transparent"
        id="start-bg-inner"
        opacity={bgOpacity}
        r={highlighted || selected ? 8 : 9}
        role="presentation"
        stroke={bgColor}
      />

      <circle
        class={cursorClass}
        cx={point.x * scale}
        cy={point.y * scale}
        data-id={point.id}
        data-route-id={route.routeFk}
        fill="transparent"
        id="start"
        r={10}
        role="presentation"
        stroke-width={strokeWidth}
        stroke={color}
      />
    {:else if point.type === 'middle'}
      <circle
        class={cursorClass}
        cx={point.x * scale}
        cy={point.y * scale}
        data-id={point.id}
        data-route-id={route.routeFk}
        fill={bgColor}
        id="middle-bg"
        opacity={bgOpacity}
        r={6}
      />

      <circle
        class={cursorClass}
        cx={point.x * scale}
        cy={point.y * scale}
        data-id={point.id}
        data-route-id={route.routeFk}
        fill={color}
        id="middle"
        r={5}
      />
    {:else if point.type === 'top'}
      {#if route.topType === 'topout'}
        <polyline
          class={cursorClass}
          data-id={point.id}
          data-route-id={route.routeFk}
          fill="transparent"
          id="topout-bg"
          opacity={bgOpacity}
          points={`${point.x * scale - 20},${point.y * scale + 20} ${point.x * scale},${point.y * scale}, ${point.x * scale + 20},${point.y * scale + 20}`}
          stroke-width={bgStrokeWidth}
          stroke={bgColor}
        />

        <polyline
          class={cursorClass}
          data-id={point.id}
          data-route-id={route.routeFk}
          fill="transparent"
          id="topout"
          points={`${point.x * scale - 20},${point.y * scale + 20} ${point.x * scale},${point.y * scale}, ${point.x * scale + 20},${point.y * scale + 20}`}
          stroke-width={strokeWidth}
          stroke={color}
        />
      {:else}
        <line
          class={cursorClass}
          data-id={point.id}
          data-route-id={route.routeFk}
          fill="transparent"
          id="top-bg"
          opacity={bgOpacity}
          stroke-width={bgStrokeWidth}
          stroke={bgColor}
          x1={point.x * scale - 20}
          x2={point.x * scale + 20}
          y1={point.y * scale}
          y2={point.y * scale}
        />

        <line
          class={cursorClass}
          data-id={point.id}
          data-route-id={route.routeFk}
          fill="transparent"
          id="top"
          stroke-width={strokeWidth}
          stroke={color}
          x1={point.x * scale - 20}
          x2={point.x * scale + 20}
          y1={point.y * scale}
          y2={point.y * scale}
        />
      {/if}
    {/if}
  {/each}
</g>
