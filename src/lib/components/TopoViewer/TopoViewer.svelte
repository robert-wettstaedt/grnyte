<script lang="ts" module>
  export interface TopoViewerProps {
    actions?: Snippet
    editable?: boolean
    getRouteKey?: ((route: TopoRouteDTO, index: number) => number) | null
    height?: number
    initialRouteId?: number
    limitImgHeight?: boolean
    onChange?: (value: TopoDTO[], changedRoute: TopoRouteDTO) => void
    onLoad?: () => void
    selectedTopoIndex?: number
    showControls?: boolean
    topos: TopoDTO[]
  }
</script>

<script lang="ts">
  import RouteName from '$lib/components/RouteName'
  import type { PointDTO, TopoDTO, TopoRouteDTO } from '$lib/topo'
  import * as d3 from 'd3'
  import { onMount, type Snippet } from 'svelte'
  import type { ChangeEventHandler, MouseEventHandler } from 'svelte/elements'
  import Labels from './components/Labels'
  import RouteView from './components/Route'
  import { highlightedRouteStore, selectedPointTypeStore, selectedRouteStore } from './stores'

  let {
    actions,
    editable = false,
    getRouteKey = null,
    height: elementHeight,
    initialRouteId,
    limitImgHeight = true,
    onChange,
    onLoad,
    selectedTopoIndex = $bindable(0),
    showControls = true,
    topos = $bindable(),
  }: TopoViewerProps = $props()

  let img: HTMLImageElement | undefined = $state()
  let imgWrapper: HTMLDivElement | undefined = $state()

  let height = $state(0)
  let width = $state(0)
  let scale = $state(0)
  let translateX = $state(0)
  let translateY = $state(0)
  let selectedPoint: PointDTO | undefined = undefined
  let svg: SVGSVGElement | undefined = $state()
  let clicked = false
  let linesVisible = $state(true)
  let isFullscreen = $state(false)

  let zoom: d3.ZoomBehavior<Element, unknown> | null = $state(null)
  let zoomTransform: d3.ZoomTransform | undefined = $state()

  let selectedTopo = $derived.by(() => {
    const topo = topos.at(selectedTopoIndex)
    if (topo != null) {
      const routes = topo.routes.toSorted((a, b) => {
        const prioA = $highlightedRouteStore === a.routeFk ? 2 : $selectedRouteStore === a.routeFk ? 1 : 0
        const prioB = $highlightedRouteStore === b.routeFk ? 2 : $selectedRouteStore === b.routeFk ? 1 : 0

        return prioA - prioB
      })

      return { ...topo, routes }
    }

    return topo
  })

  let selectedTopoRoute = $derived(
    topos.flatMap((topo) => topo.routes).find((route) => route.routeFk === $selectedRouteStore),
  )

  selectedRouteStore.subscribe((newSelectedRoute) => {
    $selectedPointTypeStore = null
    selectedPoint = undefined

    const index = topos.findIndex((topo) => topo.routes.some((route) => route.routeFk === $selectedRouteStore))
    selectedTopoIndex = index < 0 ? selectedTopoIndex : index
  })

  const onClickSvg: MouseEventHandler<SVGElement> = (event) => {
    let updated = false
    if (!editable && !clicked) {
      clicked = true
      initZoom()
    }

    if ($selectedRouteStore != null && $selectedPointTypeStore != null) {
      if (selectedTopoRoute == null) {
        return
      }

      const point: PointDTO = {
        id: crypto.randomUUID?.() ?? String(Math.random()),
        type: $selectedPointTypeStore,
        x: Math.ceil((event.layerX - (zoomTransform?.x ?? 0)) / scale / (zoomTransform?.k ?? 1)),
        y: Math.ceil((event.layerY - (zoomTransform?.y ?? 0)) / scale / (zoomTransform?.k ?? 1)),
      }

      const closePoint = topos
        .flatMap((topo) => topo.routes.flatMap((route) => route.points))
        .find((p) => Math.abs(p.x - point.x) < 30 && Math.abs(p.y - point.y) < 30)

      if (closePoint != null) {
        point.x = closePoint.x
        point.y = closePoint.y
      }

      selectedTopoRoute.points = [...selectedTopoRoute.points, point]
      $selectedPointTypeStore = null
      onChange?.(topos, selectedTopoRoute)
      updated = true
    }

    if (
      $selectedRouteStore != null &&
      $selectedPointTypeStore == null &&
      (event.target as Element).tagName === 'svg' &&
      !updated
    ) {
      selectedRouteStore.set(null)
    }
  }

  const onMouseMoveSvg: MouseEventHandler<SVGElement> = (event) => {
    const routeIdStr = (event.target as HTMLElement).attributes.getNamedItem('data-route-id')?.value
    const routeId = Number(routeIdStr)

    if ($selectedRouteStore !== routeId) {
      highlightedRouteStore.set(Number.isNaN(routeId) ? null : routeId)
    }
  }

  const onChangeTopType: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (selectedTopoRoute != null) {
      selectedTopoRoute.topType = event.currentTarget.checked ? 'topout' : 'top'
      onChange?.(topos, selectedTopoRoute)
    }
  }

  const onChangeType = (type: PointDTO['type']) => () => {
    $selectedPointTypeStore = $selectedPointTypeStore === type ? null : type
  }

  const onChangeRoute = (index: number) => (value: TopoRouteDTO) => {
    if (selectedTopo != null) {
      selectedTopo.routes[index] = value
    }

    onChange?.(topos, value)
  }

  const onPrevTopo = () => {
    selectedTopoIndex = Math.max(selectedTopoIndex - 1, 0)
    selectedRouteStore.set(null)
  }

  const onNextTopo = () => {
    selectedTopoIndex = Math.min(selectedTopoIndex + 1, topos.length - 1)
    selectedRouteStore.set(null)
  }

  const getDimensions = () => {
    if (img == null || imgWrapper == null) {
      return
    }

    scale = img.width / img.naturalWidth
    height = img.height
    width = img.width
    translateX = img.getBoundingClientRect().x - imgWrapper.getBoundingClientRect().x
    translateY = img.getBoundingClientRect().y - imgWrapper.getBoundingClientRect().y
  }

  const initZoom = () => {
    if (svg == null) {
      return
    }

    zoom = d3
      .zoom()
      .extent([
        [0, 0],
        [width, height],
      ])
      .translateExtent([
        [-width / 2, -height / 2],
        [width * 1.5, height * 1.5],
      ])
      .scaleExtent([0.5, 9])
      .on('zoom', (event: { transform: d3.ZoomTransform }) => {
        zoomTransform = event.transform
      })

    d3.select(svg).call(zoom as any)
  }

  const onResetZoom = () => {
    zoom?.transform(d3.select(svg as Element), d3.zoomIdentity)
    zoomTransform = undefined
  }

  const onToggleLines = () => {
    linesVisible = !linesVisible
  }

  const onToggleFullscreen = (value?: boolean) => {
    isFullscreen = value ?? !isFullscreen

    if (document.scrollingElement instanceof HTMLElement) {
      document.scrollingElement.style.overflow = isFullscreen ? 'hidden' : ''
    }

    requestAnimationFrame(() => {
      getDimensions()

      if (zoom == null) {
        initZoom()
      }
    })
  }

  const onLoadImage = () => {
    getDimensions()
    onLoad?.()

    if (editable) {
      initZoom()
    }
  }

  onMount(() => {
    if (imgWrapper == null) {
      return
    }

    new ResizeObserver(() => {
      if (zoomTransform != null) {
        zoomTransform = undefined
      }

      requestAnimationFrame(() => {
        getDimensions()
      })
    }).observe(imgWrapper)
  })
</script>

<svelte:document
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      onToggleFullscreen(false)
    }
  }}
/>

{#if editable}
  <div class="flex justify-between p-2 preset-filled-surface-100-900">
    {#if $selectedRouteStore == null || selectedTopoRoute == null}
      <p>&nbsp;</p>
    {:else}
      <label class="flex items-center space-x-2">
        <input
          checked={selectedTopoRoute?.topType === 'topout'}
          class="checkbox"
          onchange={onChangeTopType}
          type="checkbox"
        />

        <p>Topout</p>
      </label>

      <div class="flex gap-1">
        <button
          class={`btn btn-sm ${$selectedPointTypeStore === 'start' ? 'preset-filled-success-500' : 'preset-filled-secondary-500'}`}
          disabled={(selectedTopoRoute?.points ?? []).filter((point) => point.type === 'start').length >= 2}
          onclick={onChangeType('start')}
        >
          Start
        </button>

        <button
          class={`btn btn-sm ${$selectedPointTypeStore === 'middle' ? 'preset-filled-success-500' : 'preset-filled-secondary-500'}`}
          onclick={onChangeType('middle')}
        >
          Middle
        </button>

        <button
          class={`btn btn-sm ${$selectedPointTypeStore === 'top' ? 'preset-filled-success-500' : 'preset-filled-secondary-500'}`}
          disabled={(selectedTopoRoute?.points ?? []).filter((point) => point.type === 'top').length >= 1}
          onclick={onChangeType('top')}
        >
          Top
        </button>
      </div>
    {/if}
  </div>
{/if}

<div
  bind:this={imgWrapper}
  class="relative overflow-hidden h-full w-full flex items-center justify-center {isFullscreen
    ? '!fixed top-0 left-0 !z-[1000]'
    : ''}"
  style={elementHeight == null ? undefined : `min-height: ${elementHeight}px`}
>
  {#each topos as topo, index}
    {#if index === selectedTopoIndex}
      {#if topo.file.error == null}
        <img
          alt={topo.file.storageObject.name}
          bind:this={img}
          class="absolute top-0 left-0 w-full h-full object-cover blur pointer-events-none touch-none"
          onload={getDimensions}
          src="/storage?resource={topo.file.stat?.url}"
        />

        <img
          alt={topo.file.storageObject.name}
          bind:this={img}
          class="m-auto relative max-h-full z-10 pointer-events-none touch-none origin-top-left"
          id={limitImgHeight ? 'img' : undefined}
          onload={onLoadImage}
          src="/storage?resource={topo.file.stat?.url}"
          style={zoomTransform == null
            ? undefined
            : `transform: translate(${zoomTransform.x}px, ${zoomTransform.y}px) scale(${zoomTransform.k})`}
        />
      {:else}
        <p>Error loading image</p>
      {/if}
    {/if}
  {/each}

  <div
    class="absolute z-20 {linesVisible ? 'opacity-100' : 'opacity-0'}"
    style={`left: ${translateX}px; right: ${translateX}px; top: ${translateY}px; bottom: ${translateY}px`}
  >
    {#if selectedTopo != null}
      <svg
        bind:this={svg}
        onclick={onClickSvg}
        onmousemove={onMouseMoveSvg}
        role="presentation"
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g transform={zoomTransform?.toString()}>
          {#each selectedTopo.routes as _, index}
            <RouteView
              {editable}
              {height}
              {scale}
              {width}
              bind:route={selectedTopo.routes[index]}
              onChange={onChangeRoute(index)}
            />
          {/each}
        </g>
      </svg>

      <Labels {getRouteKey} {scale} routes={selectedTopo?.routes} />
    {/if}
  </div>

  {#if showControls}
    <div class="flex flex-col items-end gap-4 absolute top-2 right-2 z-30 topo-controls">
      {#if topos.length > 1}
        <div class="flex gap-1">
          <button
            aria-label="Previous Topo"
            class="btn-icon preset-filled"
            disabled={selectedTopoIndex <= 0}
            onclick={onPrevTopo}
          >
            <i class="fa-solid fa-caret-left"></i>
          </button>

          <button
            aria-label="Next Topo"
            class="btn-icon preset-filled"
            disabled={selectedTopoIndex >= topos.length - 1}
            onclick={onNextTopo}
          >
            <i class="fa-solid fa-caret-right"></i>
          </button>
        </div>
      {/if}

      <button
        aria-label="Reset zoom"
        class="btn-icon preset-filled"
        disabled={zoomTransform == null}
        onclick={onResetZoom}
      >
        <i class="fa-solid fa-rotate-right"></i>
      </button>

      <button
        aria-label="Toggle lines"
        class="btn-icon {linesVisible ? 'preset-filled' : 'preset-filled-secondary-500'}"
        onclick={onToggleLines}
      >
        <i class="fa-solid {linesVisible ? 'fa-eye-slash' : 'fa-eye'}"></i>
      </button>

      <button
        aria-label="Fullscreen"
        class="btn-icon {isFullscreen ? 'preset-filled-secondary-500' : 'preset-filled'}"
        onclick={() => onToggleFullscreen()}
      >
        <i class="fa-solid {isFullscreen ? 'fa-compress' : 'fa-expand'}"></i>
      </button>

      {#if actions != null}
        {@render actions()}
      {/if}
    </div>
  {/if}

  {#if selectedTopoRoute?.route != null && selectedTopoRoute.route.id !== initialRouteId}
    <a
      class="anchor absolute z-20 bg-primary-50 px-3 py-2 rounded shadow top-1 z-30 text-overflow-ellipsis whitespace-nowrap overflow-hidden max-w-full topo-controls"
      href={`/routes/${selectedTopoRoute.route.id}`}
      onclick={() => (isFullscreen ? onToggleFullscreen() : undefined)}
    >
      <RouteName route={selectedTopoRoute.route} />
    </a>
  {/if}
</div>

<style>
  @media print {
    #img {
      max-height: none;
    }

    .topo-controls {
      display: none;
    }

    img {
      print-color-adjust: exact !important;
    }
  }
</style>
