<script lang="ts">
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    path: string | undefined | null
    size: number
  }

  const { path, size }: Props = $props()

  let mediaHasError = $state(false)

  let progressSize = $derived(size - size * 0.2)

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
  <i
    class="fa-solid fa-image flex items-center justify-center text-white text-[3rem]"
    style="width: {size}px; height: {size}px;"
  ></i>
{:else}
  <div class="relative">
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style="width: {progressSize}px; height: {progressSize}px;"
    >
      <ProgressRing size="size-full" value={null} />
    </div>

    <img
      alt=""
      class="z-0 relative"
      loading="lazy"
      src="{path}?x={size}&y={size}&mimeFallback=true&a=0"
      style="width: {size}px; height: {size}px;"
      use:mediaAction
    />
  </div>
{/if}
