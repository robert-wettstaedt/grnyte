<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import type { MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { ClassValue } from 'svelte/elements'

  interface Props {
    upload: MediaUpload
    /** Re-run a failed upload. */
    onRetry: () => void
    /** Abort and drop the upload. Omit to hide the remove button. */
    onRemove?: () => void
    /** Tile size, set by the caller (the form uses square thumbs, the grid taller ones). */
    class?: ClassValue
  }

  const { upload, onRetry, onRemove, class: className = 'h-26 w-26' }: Props = $props()
</script>

<div class={['border-surface-300-700 bg-surface-100-900 relative overflow-hidden rounded-xl border', className]}>
  {#if upload.kind === 'video'}
    <!-- An <img> can't render a video object URL, a muted <video> shows the first frame. -->
    <video src={upload.previewUrl} muted playsinline preload="metadata" class="h-full w-full object-cover"></video>
  {:else}
    <img src={upload.previewUrl} alt={upload.file.name} class="h-full w-full object-cover" />
  {/if}

  {#if upload.status === 'failed'}
    <span class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
      <button
        type="button"
        class="btn-icon preset-filled-error-500"
        aria-label={m.common_retry()}
        title={upload.error ?? m.upload_failed()}
        onclick={onRetry}
      >
        <Icon name="sync" size={15} />
      </button>
    </span>
  {:else if upload.status === 'uploading'}
    <span class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
      <span class="font-mono text-xs font-bold text-white">{Math.round(upload.progress * 100)}%</span>
      <span class="h-1 w-14 overflow-hidden rounded-full bg-white/25">
        <span
          class="bg-primary-400 block h-full rounded-full transition-[width] duration-150"
          style="width: {Math.round(upload.progress * 100)}%"
        ></span>
      </span>
    </span>
  {:else if upload.status === 'staged' || upload.status === 'finalizing'}
    <span class="absolute inset-0 flex items-center justify-center bg-black/40">
      <LoadingIndicator class="w-fit" size="4" />
    </span>
  {/if}

  {#if onRemove != null && upload.status !== 'finalizing' && upload.status !== 'done'}
    <button
      type="button"
      class="btn-icon preset-glass-neutral absolute top-1.5 right-1.5"
      aria-label={m.common_remove()}
      onclick={onRemove}
    >
      <Icon name="close" size={12} />
    </button>
  {/if}
</div>
