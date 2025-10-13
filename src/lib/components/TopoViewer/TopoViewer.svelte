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
    selectionBehavior?: 'scroll' | 'none'
    showControls?: boolean
    topos: TopoDTO[]
  }
</script>

<script lang="ts">
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import { getDistance } from '$lib/geometry'
  import type { PointDTO, TopoDTO, TopoRouteDTO } from '$lib/topo'
  import * as d3 from 'd3'
  import { onMount, type Snippet } from 'svelte'
  import type { ChangeEventHandler, MouseEventHandler } from 'svelte/elements'
  import { slide } from 'svelte/transition'
  import Labels from './components/Labels'
  import Magnifier from './components/Magnifier'
  import RouteView from './components/Route'
  import { selectedPointTypeStore, selectedRouteStore } from './stores'

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
    selectionBehavior = 'none',
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
  let rect: SVGRectElement | undefined = $state()
  let clicked = false
  let linesVisible = $state(true)
  let isFullscreen = $state(false)

  let zoom: d3.ZoomBehavior<Element, unknown> | null = $state(null)
  let zoomTransform: d3.ZoomTransform | undefined = $state()

  let selectedTopo = $derived.by(() => {
    const topo = topos.at(selectedTopoIndex)
    if (topo != null) {
      const routes = topo.routes.toSorted((a, b) => {
        const prioA = $selectedRouteStore === a.routeFk ? 1 : 0
        const prioB = $selectedRouteStore === b.routeFk ? 1 : 0

        return prioA - prioB
      })

      return { ...topo, routes }
    }

    return topo
  })

  let selectedTopoRoute = $derived(selectedTopo?.routes.find((route) => route.routeFk === $selectedRouteStore))

  const onClickSvg: MouseEventHandler<SVGElement> = (event) => {
    let updated = false
    if (!editable && !clicked) {
      clicked = true
      initZoom()
    }

    const [x, y] = d3.pointer(event, rect)

    if ($selectedRouteStore != null && $selectedPointTypeStore != null) {
      if (selectedTopoRoute == null) {
        return
      }

      const point: PointDTO = {
        id: crypto.randomUUID?.() ?? String(Math.random()),
        type: $selectedPointTypeStore,
        x: Math.round(x / scale),
        y: Math.round(y / scale),
      }

      const closePoint = topos
        .flatMap((topo) => topo.routes.flatMap((route) => route.points))
        .map((p) => ({ point: p, distance: getDistance(p, point) }))
        .sort((a, b) => a.distance - b.distance)
        .at(0)

      if (closePoint != null && closePoint.distance < 40) {
        point.x = closePoint.point.x
        point.y = closePoint.point.y
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

  const onChangeTopType: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (selectedTopoRoute != null) {
      ;(selectedTopoRoute.topType as TopoRouteDTO['topType']) = event.currentTarget.checked ? 'topout' : 'top'
      onChange?.(topos, selectedTopoRoute)
    }
  }

  const onChangeType = (type: PointDTO['type']) => () => {
    $selectedPointTypeStore = $selectedPointTypeStore === type ? null : type
  }

  const onChangeRoute = (value: TopoRouteDTO) => {
    onChange?.(topos, value)
  }

  const onPrevTopo = () => {
    selectedRouteStore.set(null)
    selectedTopoIndex = Math.max(selectedTopoIndex - 1, 0)
  }

  const onNextTopo = () => {
    selectedRouteStore.set(null)
    selectedTopoIndex = Math.min(selectedTopoIndex + 1, topos.length - 1)
  }

  const getDimensions = () => {
    if (img == null || imgWrapper == null) {
      return
    }

    const imgBcr = img.getBoundingClientRect()
    const wrapperBcr = imgWrapper.getBoundingClientRect()

    if (wrapperBcr.height > img.naturalHeight && wrapperBcr.width > img.naturalWidth) {
      const widthDiff = wrapperBcr.width - img.naturalWidth
      const heightDiff = wrapperBcr.height - img.naturalHeight

      if (widthDiff > heightDiff) {
        img.style.width = ''
        img.style.height = '100%'
      } else {
        img.style.width = '100%'
        img.style.height = ''
      }
    } else {
      img.style.width = ''
      img.style.height = ''
    }

    scale = img.width / img.naturalWidth
    height = img.height
    width = img.width
    translateX = imgBcr.x - wrapperBcr.x
    translateY = imgBcr.y - wrapperBcr.y
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
    const observer = new ResizeObserver(() => {
      if (zoomTransform != null) {
        zoomTransform = undefined
      }

      requestAnimationFrame(() => {
        getDimensions()
      })
    })
    imgWrapper != null && observer.observe(imgWrapper)

    const unsubscribe = selectedRouteStore.subscribe((value) => {
      $selectedPointTypeStore = null
      selectedPoint = undefined

      const toposWithRoute = topos.filter((topo) => topo.routes.some((route) => route.routeFk === value))

      if (toposWithRoute.length === 1) {
        const index = topos.findIndex((topo) => topo.id === toposWithRoute.at(0)?.id)
        selectedTopoIndex = index < 0 ? selectedTopoIndex : index
      }

      if (value != null && selectionBehavior === 'scroll') {
        imgWrapper?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })

    return () => {
      unsubscribe()
      imgWrapper != null && observer.unobserve(imgWrapper)
    }
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
  <div class="preset-filled-surface-100-900 flex justify-between p-2">
    {#if $selectedRouteStore == null}
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
  class="relative flex h-full w-full items-center justify-center overflow-hidden {isFullscreen
    ? '!fixed top-0 left-0 !z-[1000]'
    : ''}"
  style={elementHeight == null ? undefined : `min-height: ${elementHeight}px`}
>
  {#if selectedTopo != null}
    {#if selectedTopo.file.error == null}
      <img
        alt={selectedTopo.file.path}
        bind:this={img}
        class="pointer-events-none absolute top-0 left-0 h-full w-full touch-none object-cover blur"
        onload={getDimensions}
        src={`/nextcloud${selectedTopo.file.path}`}
      />

      <img
        alt={selectedTopo.file.path}
        bind:this={img}
        class="pointer-events-none relative z-10 m-auto max-h-full origin-top-left touch-none"
        id={limitImgHeight ? 'img' : undefined}
        onload={onLoadImage}
        src={`/nextcloud${selectedTopo.file.path}`}
        style={zoomTransform == null
          ? undefined
          : `transform: translate(${zoomTransform.x}px, ${zoomTransform.y}px) scale(${zoomTransform.k})`}
      />

      <Magnifier file={selectedTopo.file} {rect} {width} {height} />
    {:else}
      <p>Error loading image</p>
    {/if}
  {/if}

  <div class="absolute top-0 right-0 bottom-0 left-0 z-20 {linesVisible ? 'opacity-100' : 'opacity-0'}">
    {#if selectedTopo != null}
      <svg
        bind:this={svg}
        class="h-full w-full"
        onclick={onClickSvg}
        role="presentation"
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          {height}
          {width}
          bind:this={rect}
          fill="transparent"
          role="presentation"
          transform={zoomTransform?.toString()}
          x={0}
          y={0}
          style="pointer-events: none; touch-action: none;"
        />

        <g role="presentation" transform={zoomTransform?.toString()}>
          {#each selectedTopo.routes as _, index}
            <RouteView
              {editable}
              {height}
              {index}
              {scale}
              {width}
              bind:routes={selectedTopo.routes}
              onChange={onChangeRoute}
            />
          {/each}
        </g>
      </svg>

      <div
        class="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 touch-none"
        style="width: {width}px; height: {height}px;"
      >
        <Labels {getRouteKey} {scale} routes={selectedTopo?.routes} />
      </div>
    {/if}
  </div>

  {#if showControls}
    <div class="topo-controls absolute top-2 right-2 z-30 flex flex-col items-end gap-4">
      {#if topos.length > 1}
        <div class="flex gap-1">
          <button
            aria-label="Previous Topo"
            class="btn-icon bg-white/70 text-black backdrop-blur-sm"
            disabled={selectedTopoIndex <= 0}
            onclick={onPrevTopo}
          >
            <i class="fa-solid fa-caret-left"></i>
          </button>

          <button
            aria-label="Next Topo"
            class="btn-icon bg-white/70 text-black backdrop-blur-sm"
            disabled={selectedTopoIndex >= topos.length - 1}
            onclick={onNextTopo}
          >
            <i class="fa-solid fa-caret-right"></i>
          </button>
        </div>
      {/if}

      <button
        aria-label="Reset zoom"
        class="btn-icon bg-white/70 text-black backdrop-blur-sm"
        disabled={zoomTransform == null}
        onclick={onResetZoom}
      >
        <i class="fa-solid fa-arrows-to-dot"></i>
      </button>

      <button
        aria-label="Toggle lines"
        class="btn-icon {linesVisible ? 'bg-white/70' : 'preset-filled-secondary-500'} text-black backdrop-blur-sm"
        onclick={onToggleLines}
      >
        <i class="fa-solid {linesVisible ? 'fa-eye-slash' : 'fa-eye'}"></i>
      </button>

      <button
        aria-label="Fullscreen"
        class="btn-icon {isFullscreen ? 'preset-filled-secondary-500' : 'bg-white/70'} text-black backdrop-blur-sm"
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
      class="bg-primary-50-950 text-overflow-ellipsis topo-controls absolute right-1 bottom-1 left-1 z-30 overflow-hidden rounded p-2 whitespace-nowrap shadow"
      href={`/routes/${selectedTopoRoute.route.id}`}
      onclick={() => (isFullscreen ? onToggleFullscreen() : undefined)}
      transition:slide={{ duration: 100 }}
    >
      <RouteName route={selectedTopoRoute.route} />

      <MarkdownRenderer
        className="short"
        encloseReferences="strong"
        markdown={selectedTopoRoute.route.description ?? ''}
      />
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
