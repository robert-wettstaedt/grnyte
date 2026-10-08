<!-- An image's box before the image: the same classes and ratio give the same size, so the photo
     lands without moving anything. -->
<script lang="ts">
  import type { ClassValue } from 'svelte/elements'

  interface Props {
    /** The sizing the image will have (`max-h-88 w-full`). */
    class?: ClassValue
    /** Width over height, from the stored file dimensions. */
    ratio: number
  }

  const { class: className, ratio }: Props = $props()
</script>

<!-- The hold and the pulse are two elements: both are an `animation`, and one would cancel the other. -->
<div class={['skeleton-hold overflow-hidden rounded-xl', className]} style:aspect-ratio={ratio} aria-busy="true">
  <div class="bg-surface-200-800 h-full w-full animate-pulse"></div>
</div>
