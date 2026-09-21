<script lang="ts">
  import Image from '$lib/components/Image/Image.svelte'
  import type { Snippet } from 'svelte'
  import type { TopoImageBox } from './imageBox.svelte'

  interface Props {
    alt: string
    /** Takes the loaded image's natural size, the fallback coordinate space. */
    box: TopoImageBox
    /** Replaces the centred failure placeholder, which sits exactly where the lines are drawn. */
    error?: Snippet
    /** `files.path` of the topo image. */
    path: string
  }

  const { alt, box, error, path }: Props = $props()
</script>

<!-- Keyed so a topo switch remounts the image and resets the natural size to 0. The 1024 derivative
     is enough; the multi-MB original stays on the server. -->
{#key path}
  <!-- Eager and high priority: lazy never fires when a sheet sizes the box to zero, and eager
       alone still queues the request behind map tiles. -->
  <Image
    {path}
    {alt}
    {error}
    fetchpriority="high"
    loading="eager"
    class="pointer-events-none h-full w-full touch-none bg-transparent! select-none"
    fit="contain"
    previewWidth={1024}
    bind:failure={box.failure}
    bind:naturalWidth={box.naturalWidth}
    bind:naturalHeight={box.naturalHeight}
  />
{/key}
