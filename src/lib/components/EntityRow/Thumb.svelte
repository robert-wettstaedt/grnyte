<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import Image from '$lib/components/Image/Image.svelte'

  interface Props {
    /** Icon shown when there's no image. */
    fallback: IconName
    /** `files.path` of the thumbnail image; falls back to the icon when absent. */
    imagePath?: string
  }

  let { fallback, imagePath }: Props = $props()
</script>

<span class="thumb bg-surface-200-800">
  {#if imagePath != null}
    <Image path={imagePath} alt="" class="h-full w-full object-cover" previewWidth={256} />
  {:else}
    <span class="text-surface-500 absolute inset-0 grid place-items-center" aria-hidden="true">
      <Icon name={fallback} size={24} />
    </span>
  {/if}
</span>

<style>
  .thumb {
    width: 52px;
    height: 52px;
    flex: none;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
  }
</style>
