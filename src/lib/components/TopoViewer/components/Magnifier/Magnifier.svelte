<script lang="ts">
  import type { FileDTO } from '$lib/nextcloud'
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { dragStore } from '../../stores'

  interface Props {
    file: FileDTO
    rect: SVGRectElement | undefined
    width: number
    height: number
  }

  let { file, rect, width, height }: Props = $props()

  let imagePosition = $state({ x: 0, y: 0 })
  let position = $state<{ x: number; y: number } | null>(null)
  let scale = $state({ x: 0, y: 0 })

  const onLoadImage = (event: Event) => {
    const img = event.currentTarget as HTMLImageElement
    scale = { x: (img.width / width) * 10, y: (img.height / height) * 10 }
  }

  onMount(() => {
    return dragStore.subscribe((event) => {
      if (event == null) {
        position = null
      } else {
        const sourceEvent = event.sourceEvent
        const bcr = rect?.getBoundingClientRect()

        if (bcr != null) {
          position = {
            x: (sourceEvent as TouchEvent).touches?.[0]?.clientX ?? (sourceEvent as MouseEvent).clientX,
            y: (sourceEvent as TouchEvent).touches?.[0]?.clientY ?? (sourceEvent as MouseEvent).clientY,
          }
        }

        imagePosition = {
          x: scale.x * event.x,
          y: scale.y * event.y,
        }
      }
    })
  })
</script>

{#if position != null}
  <div
    class="fixed top-0 left-0 w-[128px] h-[128px] rounded-full border-2 overflow-hidden pointer-events-none touch-none origin-top-left z-30 origin-top-left"
    style="transform: translate({position.x - 128 / 2}px, {position.y - 128 - 32}px)"
    transition:fade={{ duration: 100 }}
  >
    <img
      alt={file.stat?.filename}
      class="w-full h-full object-fill origin-top-left"
      onload={onLoadImage}
      src={`/nextcloud${file.stat?.filename}`}
      style="transform: translate({-imagePosition.x + 128 / 2}px, {-imagePosition.y + 128 / 2}px) scale(10)"
    />

    <div
      class="absolute top-1/2 left-1/2 w-[2px] h-4 opacity-75 bg-error-500 transform translate-x-[-50%] translate-y-[-50%]"
    ></div>
    <div
      class="absolute top-1/2 left-1/2 w-4 h-[2px] opacity-75 bg-error-500 transform translate-x-[-50%] translate-y-[-50%]"
    ></div>
  </div>
{/if}
