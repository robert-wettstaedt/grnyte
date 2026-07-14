<script lang="ts">
  import MediaLightbox from '$lib/components/Media/MediaLightbox.svelte'
  import MediaThumbnail from '$lib/components/Media/MediaThumbnail.svelte'
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
    <MediaThumbnail {file} badged class="h-40 snap-start" />
  {/each}
</div>

<MediaLightbox {items} {shareText} />
