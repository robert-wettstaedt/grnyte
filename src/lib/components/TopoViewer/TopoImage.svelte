<script lang="ts">
  import { getI18n } from '$lib/i18n'
  import type { TopoDTO } from '$lib/topo'
  import type { Attachment } from 'svelte/attachments'
  import Route from './components/Route'

  interface Dimensions {
    height: number
    width: number
    scale: number
  }

  interface Props {
    height?: number
    value: TopoDTO
  }

  const { value, ...props }: Props = $props()
  const { t } = getI18n()

  let dimensions = $state<Dimensions>()
  let loading = $state(true)
  let error = $state(false)
  let img = $state<HTMLImageElement>()

  function getDimensions() {
    if (img == null) {
      dimensions = undefined
    } else if (props.height == null) {
      dimensions = {
        scale: img.width / img.naturalWidth,
        height: img.height,
        width: img.width,
      }
    } else {
      const scale = props.height / img.naturalHeight

      dimensions = {
        scale,
        height: props.height,
        width: Math.floor(img.naturalWidth * scale),
      }
    }
  }

  const imageAttachment: Attachment = (element) => {
    function onError() {
      error = true
    }

    function onloadImage() {
      loading = false
      getDimensions()
    }

    element.addEventListener('error', onError)
    element.addEventListener('load', onloadImage)

    return () => {
      element.removeEventListener('error', onError)
      element.removeEventListener('load', onloadImage)
    }
  }
</script>

<div
  class="relative overflow-hidden rounded-xl"
  style="height: {dimensions?.height ?? props.height ?? 0}px; width: {dimensions?.width ?? props.height ?? 0}px;"
>
  <img
    alt={value.file.path}
    bind:this={img}
    height={dimensions?.height ?? 0}
    src={`/nextcloud${value.file.path}`}
    width={dimensions?.width ?? 0}
    {@attach imageAttachment}
  />

  {#if dimensions == null}
    <div class="absolute top-0 right-0 bottom-0 left-0 -z-1">
      {#if loading}
        <div class="placeholder h-full w-full animate-pulse"></div>
      {:else if value.file.error != null || error || 1}
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
        class="h-full w-full"
        role="presentation"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          fill="transparent"
          height={dimensions.height}
          role="presentation"
          style="pointer-events: none; touch-action: none;"
          width={dimensions.width}
          x={0}
          y={0}
        />

        <g role="presentation">
          {#each value.routes as _, index}
            <Route
              {index}
              bind:routes={value.routes}
              height={dimensions.height}
              scale={dimensions.scale}
              width={dimensions.width}
            />
          {/each}
        </g>
      </svg>
    </div>
  {/if}
</div>
