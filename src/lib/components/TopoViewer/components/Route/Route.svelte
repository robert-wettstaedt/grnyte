<script module lang="ts">
  export type Coordinates = Pick<PointDTO, 'x' | 'y'>

  export interface Line {
    from: Coordinates
    to: Coordinates
  }
</script>

<script lang="ts">
  import { getDistance } from '$lib/geometry'
  import { type PointDTO, type TopoRouteDTO } from '$lib/topo'
  import * as d3 from 'd3'
  import { onMount } from 'svelte'
  import type { MouseEventHandler } from 'svelte/elements'
  import { dragStore, selectedPointTypeStore, selectedRouteStore } from '../../stores'
  import { calcLines } from './lib'

  interface Props {
    editable?: boolean
    index: number
    onChange?: (route: TopoRouteDTO) => void
    routes: TopoRouteDTO[]
    scale: number
    height: number
    width: number
  }

  let { editable = false, index, onChange, routes = $bindable(), scale, height, width }: Props = $props()

  let group: SVGGElement | undefined = $state()

  let selected = $derived($selectedRouteStore === routes[index].routeFk)

  let cursorClass = $derived(selected && editable ? 'cursor-move' : 'cursor-pointer')

  let color = $derived(selected ? 'white' : '#ff7f0e')
  let bgColor = 'black'
  let bgOpacity = 0.5

  let strokeWidth = $derived(selected ? 4 : 2)
  let bgStrokeWidth = $derived(selected ? 6 : 4)

  let selectedPoint: PointDTO | undefined = $state(undefined)

  let lines = $derived(calcLines(routes[index].points))

  let longPressTimer: ReturnType<typeof setTimeout> | undefined = $state()
  let longPressPoint: PointDTO | undefined = $state()
  const LONG_PRESS_DURATION = 1000

  const clearLongPress = () => {
    clearTimeout(longPressTimer)
    longPressTimer = undefined
    longPressPoint = undefined
  }

  const onDeletePoint: MouseEventHandler<Element> = (event) => {
    event.preventDefault()

    if (longPressPoint == null) {
      return
    }

    const currentIndex = index
    routes[currentIndex].points = routes[currentIndex].points.filter((_point) => _point.id !== longPressPoint?.id)
    selectedPoint = undefined
    onChange?.(routes[currentIndex])

    clearLongPress()
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
          const point = routes[index].points.find((point) => point.id === targetId)
          selectedPoint = point

          clearLongPress()

          if (selected && editable && point != null) {
            longPressTimer = setTimeout(() => {
              if ($selectedRouteStore === routes[index].routeFk) {
                longPressPoint = point
              }
            }, LONG_PRESS_DURATION)
          }

          if (!selected && $selectedPointTypeStore == null) {
            selectedRouteStore.set(routes[index].routeFk)
          }
        })
        .on('drag', (event) => {
          if (!editable) {
            return
          }

          clearLongPress()

          const points = selectedPoint == null ? routes[index].points : [selectedPoint]

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

          if (points.length === 1) {
            const closePoint = routes
              .flatMap((route) => route.points)
              .filter((p) => p.id !== points[0].id)
              .map((p) => ({ point: p, distance: getDistance(p, points[0]) }))
              .sort((a, b) => a.distance - b.distance)
              .at(0)

            if (closePoint != null && closePoint.distance < 20) {
              points[0].x = closePoint.point.x
              points[0].y = closePoint.point.y
            }

            dragStore.set({ ...event, x: points[0].x, y: points[0].y })
          } else {
            dragStore.set(event)
          }

          onChange?.(routes[index])
        })
        .on('end', () => {
          dragStore.set(null)
          selectedPoint = undefined
        })

      d3.select(group).call(drag as any)
    }

    const unsubscribe = selectedRouteStore.subscribe(() => {
      clearTimeout(longPressTimer)
      longPressTimer = undefined
      longPressPoint = undefined
    })

    return () => {
      unsubscribe()
    }
  })
</script>

<g bind:this={group} class="cursor-pointer select-none" role="presentation">
  {#each lines as line}
    <line
      data-id="line"
      data-route-id={routes[index].routeFk}
      opacity={bgOpacity}
      stroke-width={20}
      stroke="transparent"
      x1="{line.from.x * 100}%"
      x2="{line.to.x * 100}%"
      y1="{line.from.y * 100}%"
      y2="{line.to.y * 100}%"
    />

    <line
      data-id="line"
      data-route-id={routes[index].routeFk}
      opacity={bgOpacity}
      stroke-width={bgStrokeWidth}
      stroke={bgColor}
      x1="{line.from.x * 100}%"
      x2="{line.to.x * 100}%"
      y1="{line.from.y * 100}%"
      y2="{line.to.y * 100}%"
    />

    <line
      data-id="line"
      data-route-id={routes[index].routeFk}
      stroke={color}
      stroke-width={strokeWidth}
      x1="{line.from.x * 100}%"
      x2="{line.to.x * 100}%"
      y1="{line.from.y * 100}%"
      y2="{line.to.y * 100}%"
    />
  {/each}

  {#each routes[index].points as point}
    {#if point.type === 'start'}
      <circle
        class={cursorClass}
        cx="{point.x * 100}%"
        cy="{point.y * 100}%"
        data-id={point.id}
        data-route-id={routes[index].routeFk}
        fill="transparent"
        id="start-touch-area"
        opacity={bgOpacity}
        r={20}
        role="presentation"
      />

      <circle
        class={cursorClass}
        cx="{point.x * 100}%"
        cy="{point.y * 100}%"
        data-id={point.id}
        data-route-id={routes[index].routeFk}
        fill="transparent"
        id="start-bg-outer"
        opacity={bgOpacity}
        r={selected ? 12 : 11}
        role="presentation"
        stroke={bgColor}
      />

      <circle
        class={cursorClass}
        cx="{point.x * 100}%"
        cy="{point.y * 100}%"
        data-id={point.id}
        data-route-id={routes[index].routeFk}
        fill="transparent"
        id="start-bg-inner"
        opacity={bgOpacity}
        r={selected ? 8 : 9}
        role="presentation"
        stroke={bgColor}
      />

      <circle
        class={cursorClass}
        cx="{point.x * 100}%"
        cy="{point.y * 100}%"
        data-id={point.id}
        data-route-id={routes[index].routeFk}
        fill="transparent"
        id="start"
        r={10}
        role="presentation"
        stroke-width={strokeWidth}
        stroke={longPressPoint?.id === point.id ? 'red' : color}
      />
    {:else if point.type === 'middle'}
      <circle
        class={cursorClass}
        cx="{point.x * 100}%"
        cy="{point.y * 100}%"
        data-id={point.id}
        data-route-id={routes[index].routeFk}
        fill="transparent"
        id="middle-touch-area"
        r={20}
        role="presentation"
      />

      <circle
        class={cursorClass}
        cx="{point.x * 100}%"
        cy="{point.y * 100}%"
        data-id={point.id}
        data-route-id={routes[index].routeFk}
        fill={bgColor}
        id="middle-bg"
        opacity={bgOpacity}
        r={6}
      />

      <circle
        class={cursorClass}
        cx="{point.x * 100}%"
        cy="{point.y * 100}%"
        data-id={point.id}
        data-route-id={routes[index].routeFk}
        fill={longPressPoint?.id === point.id ? 'red' : color}
        id="middle"
        r={5}
      />
    {:else if point.type === 'top'}
      {#if routes[index].topType === 'topout'}
        <polyline
          class={cursorClass}
          data-id={point.id}
          data-route-id={routes[index].routeFk}
          fill="transparent"
          id="topout-touch-area"
          opacity={bgOpacity}
          points={[
            `${(point.x - 0.03) * width},${(point.y + 0.03) * height}`,
            `${point.x * width},${point.y * height}`,
            `${(point.x + 0.03) * width},${(point.y + 0.03) * height}`,
          ].join(' ')}
          stroke-width={20}
          stroke="transparent"
        />

        <polyline
          class={cursorClass}
          data-id={point.id}
          data-route-id={routes[index].routeFk}
          fill="transparent"
          id="topout-bg"
          opacity={bgOpacity}
          points={[
            `${(point.x - 0.03) * width},${(point.y + 0.03) * height}`,
            `${point.x * width},${point.y * height}`,
            `${(point.x + 0.03) * width},${(point.y + 0.03) * height}`,
          ].join(' ')}
          stroke-width={bgStrokeWidth}
          stroke={bgColor}
        />

        <polyline
          class={cursorClass}
          data-id={point.id}
          data-route-id={routes[index].routeFk}
          fill="transparent"
          id="topout"
          points={[
            `${(point.x - 0.03) * width},${(point.y + 0.03) * height}`,
            `${point.x * width},${point.y * height}`,
            `${(point.x + 0.03) * width},${(point.y + 0.03) * height}`,
          ].join(' ')}
          stroke-width={strokeWidth}
          stroke={longPressPoint?.id === point.id ? 'red' : color}
        />
      {:else}
        <line
          class={cursorClass}
          data-id={point.id}
          data-route-id={routes[index].routeFk}
          fill="transparent"
          id="top-touch-area"
          role="presentation"
          stroke-width={20}
          stroke="transparent"
          x1="{(point.x - 0.04) * 100}%"
          x2="{(point.x + 0.04) * 100}%"
          y1="{point.y * 100}%"
          y2="{point.y * 100}%"
        />

        <line
          class={cursorClass}
          data-id={point.id}
          data-route-id={routes[index].routeFk}
          fill="transparent"
          id="top-bg"
          opacity={bgOpacity}
          stroke-width={bgStrokeWidth}
          stroke={bgColor}
          x1="{(point.x - 0.03) * 100}%"
          x2="{(point.x + 0.03) * 100}%"
          y1="{point.y * 100}%"
          y2="{point.y * 100}%"
        />

        <line
          class={cursorClass}
          data-id={point.id}
          data-route-id={routes[index].routeFk}
          fill="transparent"
          id="top"
          stroke-width={strokeWidth}
          stroke={longPressPoint?.id === point.id ? 'red' : color}
          x1="{(point.x - 0.03) * 100}%"
          x2="{(point.x + 0.03) * 100}%"
          y1="{point.y * 100}%"
          y2="{point.y * 100}%"
        />
      {/if}
    {/if}
  {/each}
</g>

{#if longPressPoint != null}
  <foreignObject
    x={longPressPoint.x + 130 > width ? longPressPoint.x - 130 : longPressPoint.x}
    y={longPressPoint.y + 28 > height ? longPressPoint.y - 28 : longPressPoint.y}
    width={130}
    height={28}
  >
    <button class="btn btn-sm preset-filled-error-500 !text-white" onclick={onDeletePoint}>
      <i class="fa-solid fa-trash"></i>
      Delete point
    </button>
  </foreignObject>
{/if}
