<script lang="ts">
  import { page } from '$app/state'
  import MediaViewer from '$lib/components/Media/MediaViewer.svelte'
  import type { MediaFile } from '$lib/entities/file/dto'
  import { closeMedia, pageMedia } from '$lib/state/navigation.svelte'

  // Hosts the one fullscreen viewer for a set of media: `?media=<file id>` opens it
  // (deep-linkable, back closes it), paging swaps the param. Rendered by MediaGrid,
  // or directly by pages whose thumbnails live outside a grid (e.g. ascent rows).
  // Mount at most one per page, or the same param opens several viewers at once.
  interface Props {
    items: MediaFile[]
    /** Passed through to the viewer as the share text (the route name). */
    shareText?: string
  }

  const { items, shareText = '' }: Props = $props()

  const openFile = $derived(items.find((file) => file.id === page.url.searchParams.get('media')))
</script>

{#if openFile != null}
  <MediaViewer file={openFile} siblings={items} {shareText} onNavigate={pageMedia} onClose={closeMedia} />
{/if}
