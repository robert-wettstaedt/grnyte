<script lang="ts">
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    path: string | undefined | null
    size: number
  }

  const { path, size }: Props = $props()

  let mediaHasError = $state(false)

  let progressSize = $derived(size - size * 0.2)
  let fontSize = $derived(size * 0.8)

  const mediaAction = (el: HTMLElement) => {
    const onError = () => (mediaHasError = true)

    el.addEventListener('error', onError)

    return {
      destroy: () => {
        el.removeEventListener('error', onError)
      },
    }
  }
</script>

{#if path == null || mediaHasError}
  <div
    class="flex items-center justify-center text-white"
    style="min-width: {size}px; width: {size}px; min-height: {size}px; height: {size}px; font-size: {fontSize}px"
  >
    <i class="fa-solid fa-image"></i>
  </div>
{:else}
  <div class="relative flex h-full items-center justify-center">
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style="min-width: {progressSize}px; width: {progressSize}px; min-height: {progressSize}px; height: {progressSize}px;"
    >
      <ProgressRing size="size-full" value={null} />
    </div>

    <img
      alt=""
      class="relative z-0 object-cover"
      loading="lazy"
      src="{path}?x={size}&y={size}&mimeFallback=true&a=0"
      style="min-width: {size}px; width: {size}px; min-height: {size}px; height: {size}px;"
      use:mediaAction
    />
  </div>
{/if}
