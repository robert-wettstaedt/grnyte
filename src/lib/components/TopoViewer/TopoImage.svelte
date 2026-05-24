<script lang="ts" module>
  export interface Dimensions {
    height: number
    width: number
    scale: number
  }
</script>

<script lang="ts">
  import { getI18n } from '$lib/i18n'
  import type { TopoDTO } from '$lib/topo'
  import * as d3 from 'd3'
  import { onMount } from 'svelte'
  import type { Attachment } from 'svelte/attachments'
  import Route from './components/Route'

  interface Props {
    onload?: (dimensions: Dimensions) => void
    value: TopoDTO
    zoomable?: boolean
  }

  const { onload, value, zoomable = false }: Props = $props()
  const { t } = getI18n()

  let dimensions = $state<Dimensions>()
  let loading = $state(true)
  let error = $state(false)

  let svg = $state<SVGSVGElement>()
  let img = $state<HTMLImageElement>()
  let wrapper = $state<HTMLDivElement>()

  let zoom: d3.ZoomBehavior<Element, unknown> | null = $state(null)
  let zoomTransform: d3.ZoomTransform | undefined = $state()

  function getDimensions() {
    if (img == null || wrapper == null || img.naturalWidth === 0 || img.naturalHeight === 0) {
      return
    }

    const wrapperBcr = wrapper.getBoundingClientRect()

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

    dimensions = {
      height: img.height,
      scale: img.width / img.naturalWidth,
      width: img.width,
    }
  }

  const imageAttachment: Attachment = (element) => {
    function onError() {
      error = true
    }

    function onloadImage() {
      loading = false
      initZoom()
      getDimensions()

      if (dimensions != null) {
        onload?.(dimensions)
      }
    }

    element.addEventListener('error', onError)
    element.addEventListener('load', onloadImage)

    return () => {
      element.removeEventListener('error', onError)
      element.removeEventListener('load', onloadImage)
    }
  }

  function initZoom() {
    if (svg == null || dimensions == null || !zoomable) {
      return
    }

    zoom = d3
      .zoom()
      .extent([
        [0, 0],
        [dimensions.width, dimensions.height],
      ])
      .translateExtent([
        [-dimensions.width / 2, -dimensions.height / 2],
        [dimensions.width * 1.5, dimensions.height * 1.5],
      ])
      .scaleExtent([0.5, 9])
      .on('zoom', (event: { transform: d3.ZoomTransform }) => {
        zoomTransform = event.transform
      })

    d3.select(svg).call(zoom as any)
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
    wrapper != null && observer.observe(wrapper)

    return () => {
      wrapper != null && observer.unobserve(wrapper)
    }
  })
</script>

<div bind:this={wrapper} class="relative z-1 flex h-full w-full items-center justify-center overflow-hidden">
  <img
    alt={value.file.path}
    bind:this={img}
    class="pointer-events-none relative m-auto max-h-full origin-top-left touch-none"
    height={dimensions == null ? undefined : dimensions?.height}
    src={`/nextcloud${value.file.path}`}
    style={zoomTransform == null
      ? undefined
      : `transform: translate(${zoomTransform.x}px, ${zoomTransform.y}px) scale(${zoomTransform.k})`}
    width={dimensions == null ? undefined : dimensions?.width}
    {@attach imageAttachment}
  />

  {#if dimensions == null}
    <div class="absolute top-0 right-0 bottom-0 left-0 -z-1">
      {#if loading}
        <div class="placeholder h-full w-full animate-pulse"></div>
      {:else if value.file.error != null || error}
        <p
          class="border-error-500 text-error-500 bg-error-50 flex h-full w-full flex-col items-center justify-center gap-4 rounded-xl border-2 p-2 text-center md:p-4"
        >
          <i class="fa-solid fa-triangle-exclamation"></i>
          {t('topo.errorLoadingImage')}
        </p>
      {/if}
    </div>
  {:else}
    <div class="absolute top-0 right-0 bottom-0 left-0 z-20">
      <svg
        bind:this={svg}
        class="h-full w-full"
        role="presentation"
        viewBox="0 0 {dimensions.width} {dimensions.height}"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          fill="transparent"
          height={dimensions.height}
          role="presentation"
          style="pointer-events: none; touch-action: none;"
          transform={zoomTransform?.toString()}
          width={dimensions.width}
          x={0}
          y={0}
        />

        <g role="presentation" transform={zoomTransform?.toString()}>
          {#each value.routes as _, index}
            <Route
              {index}
              height={dimensions.height}
              onChange={() => {}}
              routes={value.routes}
              scale={dimensions.scale}
              width={dimensions.width}
            />
          {/each}
        </g>
      </svg>
    </div>
  {/if}
</div>
