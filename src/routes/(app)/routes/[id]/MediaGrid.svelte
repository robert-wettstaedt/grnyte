<script lang="ts">
  import { page } from '$app/state'
  import MediaThumbnail from '$lib/components/Media/MediaThumbnail.svelte'
  import MediaViewer from '$lib/components/Media/MediaViewer.svelte'
  import MediaDropZone from '$lib/components/MediaDropZone/MediaDropZone.svelte'
  import MediaUploadTile from '$lib/components/MediaDropZone/MediaUploadTile.svelte'
  import type { MediaFile } from '$lib/entities/file/dto'
  import {
    dropPending,
    pendingUploads,
    removePending,
    retryPending,
    type MediaUploadTarget,
  } from '$lib/entities/file/upload-manager.svelte'
  import { back, replaceUrl } from '$lib/state/navigation.svelte'

  interface Props {
    items: MediaFile[]
    /** Passed through to the viewer as the share text (the route name). */
    shareText?: string
    /** When set, uploads finalizing against this entity show as leading tiles until they sync,
     *  and (with `canEdit`) the Add tile leads the strip so new media lands right here. */
    target?: MediaUploadTarget
    /** Show the Add tile at the head of the strip (permission-gated by the caller). */
    canEdit?: boolean
  }

  const { items, shareText = '', target, canEdit = false }: Props = $props()

  const syncedIds = $derived(new Set(items.map((file) => file.id)))

  // In-flight uploads for this entity, newest work first. A `done` upload whose real
  // `files` row has already synced into `items` is hidden here (and dropped by the
  // effect below), so its tile hands off to the real row with no duplicate and no gap.
  const pending = $derived(
    target == null
      ? []
      : pendingUploads.filter(
          (entry) =>
            entry.target.type === target.type &&
            entry.target.id === target.id &&
            !(entry.upload.status === 'done' && entry.upload.fileRow != null && syncedIds.has(entry.upload.fileRow.id)),
        ),
  )

  // Hand a finished upload off to its synced row: once the real `files` row lands in
  // `items`, drop the pending entry (which revokes its preview blob). Collect first,
  // then drop, so the splice never mutates the array mid-iteration.
  $effect(() => {
    if (target == null) return
    const settled = pendingUploads.filter(
      (entry) =>
        entry.target.type === target.type &&
        entry.target.id === target.id &&
        entry.upload.status === 'done' &&
        entry.upload.fileRow != null &&
        syncedIds.has(entry.upload.fileRow.id),
    )
    for (const entry of settled) dropPending(entry.upload)
  })

  // `?media=<file id>` drives one viewer for the whole strip: the open media earns a
  // history entry (back closes it) and is deep-linkable, and paging between siblings
  // just swaps the param without remounting the dialog shell.
  const openFile = $derived(items.find((file) => file.id === page.url.searchParams.get('media')))

  const navigate = (id: string) => {
    const url = new URL(page.url)
    url.searchParams.set('media', id)
    // Replace so paging stays a single history entry: back closes the viewer rather
    // than walking back through every sibling visited. replaceUrl (not a raw goto)
    // keeps the tracked history depth honest, so back() doesn't leave the app later.
    void replaceUrl(url, { keepFocus: true, noScroll: true })
  }

  // Opening the viewer pushed a `?media` history entry, so back() pops it. On a
  // deep-linked/reloaded page there is no such entry, so fall back to replacing the
  // URL with the media-less one instead of letting history.back() leave the app.
  const closeViewer = () => {
    const url = new URL(page.url)
    url.searchParams.delete('media')
    back(url.pathname + url.search)
  }
</script>

<!-- Horizontal snap-scrolling strip: every tile is the same height, its width set
     by its own aspect ratio. -->
<div class="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2">
  {#if canEdit && target != null}
    <MediaDropZone accept={['image', 'video']} videoSource {target} />
  {/if}
  {#each pending as { upload } (upload)}
    <MediaUploadTile
      {upload}
      class="h-40 w-40 flex-none snap-start"
      onRetry={() => void retryPending(upload)}
      onRemove={() => removePending(upload)}
    />
  {/each}
  {#each items as file (file.id)}
    <MediaThumbnail {file} class="h-40 snap-start" />
  {/each}
</div>

{#if openFile != null}
  <MediaViewer file={openFile} siblings={items} {shareText} onNavigate={navigate} onClose={closeViewer} />
{/if}
