<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { addUploads, ImageUpload, VideoUpload, type MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import {
    isImageFileName,
    isVideoFile,
    MAX_IMAGE_SIZE,
    MAX_VIDEO_SIZE,
    type MediaKind,
  } from '$lib/entities/file/upload'
  import { m } from '$lib/paraglide/messages'
  import { FileUpload, Progress, useFileUpload } from '@skeletonlabs/skeleton-svelte'
  import type { FileError } from '@zag-js/file-upload'

  interface Props {
    /** Pending uploads, bound so the form can finalize them once the entity exists. */
    uploads?: MediaUpload[]
    /** What this field takes: images only (topos) or images + videos (ascents). */
    accept?: MediaKind[]
    disabled?: boolean
  }

  let { uploads = $bindable([]), accept = ['image'], disabled = false }: Props = $props()
  const id = $props.id()

  let rejections = $state<string[]>([])

  // Without an explicit maxFiles zag defaults to 1 (single-select) and rejects
  // any multi-file drop wholesale.
  const MAX_FILES = 10

  const rejectionMessage = (file: File, errors: FileError[]): string =>
    // An out-of-accept file that is also oversized carries both errors — the
    // type mismatch is the real reason, so it wins over the size complaint.
    errors.includes('FILE_INVALID_TYPE')
      ? m.upload_invalidType()
      : errors.includes('FILE_TOO_LARGE')
        ? m.upload_tooLarge({ size: sizeLabel(isVideoFile(file) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE) })
        : errors.includes('TOO_MANY_FILES')
          ? m.upload_tooMany({ count: MAX_FILES })
          : m.upload_invalidType()

  /** Which pipeline a file belongs to, if any — images win when both match. */
  const kindOf = (file: File): MediaKind | null =>
    accept.includes('image') && isImageFileName(file.name)
      ? 'image'
      : accept.includes('video') && isVideoFile(file)
        ? 'video'
        : null

  const addFiles = (files: File[]) => {
    const images: File[] = []
    const videos: File[] = []
    for (const file of files) {
      const kind = kindOf(file)
      if (kind === 'image') {
        images.push(file)
      } else if (kind === 'video') {
        videos.push(file)
      } else {
        rejections.push(`${file.name}: ${m.upload_invalidType()}`)
      }
    }
    uploads.push(...addUploads(images, ImageUpload), ...addUploads(videos, VideoUpload))
    // Our uploads are the source of truth — reset zag's own list so re-picking
    // the same file isn't rejected as a duplicate.
    fileUpload().clearFiles()
  }

  const fileUpload = useFileUpload(() => ({
    id,
    accept: [
      ...(accept.includes('image') ? ['image/*', '.heic', '.heif'] : []),
      ...(accept.includes('video') ? ['video/*'] : []),
    ],
    // Size limits are per pipeline, so they live here instead of a blanket
    // `maxFileSize`: images are capped by the staging bucket (50MB), videos by
    // our own accident/abuse knob (2GB — Bunny itself has no limit).
    validate: (file) => (file.size > (isVideoFile(file) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE) ? ['FILE_TOO_LARGE'] : null),
    maxFiles: MAX_FILES,
    disabled,
    onFileAccept: (details) => {
      rejections = []
      addFiles(details.files)
    },
    onFileReject: (details) => {
      if (details.files.length === 0) {
        return
      }
      // HEIC photos (and some videos) often carry an empty MIME type, which
      // fails zag's `image/*`/`video/*` check — rescue by file name.
      const rescued = details.files
        .filter((rejection) => rejection.errors.every((error) => error === 'FILE_INVALID_TYPE'))
        .map((rejection) => rejection.file)
        .filter((file) => kindOf(file) != null)
      if (rescued.length > 0) {
        addFiles(rescued)
      }
      rejections = details.files
        .filter((rejection) => !rescued.includes(rejection.file))
        .map((rejection) => `${rejection.file.name}: ${rejectionMessage(rejection.file, rejection.errors)}`)
    },
  }))

  const remove = (upload: MediaUpload) => {
    upload.remove()
    uploads.splice(uploads.indexOf(upload), 1)
  }

  const sizeLabel = (bytes: number): string =>
    bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

  const dropPrompt = $derived(
    accept.includes('image')
      ? accept.includes('video')
        ? m.upload_dropPromptMedia()
        : m.upload_dropPrompt()
      : m.upload_dropPromptVideo(),
  )
</script>

<div class="space-y-2">
  <FileUpload.Provider value={fileUpload}>
    <FileUpload.Dropzone
      class="border-surface-300-700 hover:border-surface-400-600 data-dragging:border-primary-500 data-dragging:bg-primary-500/10 flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed p-6 text-center data-disabled:cursor-not-allowed data-disabled:opacity-50"
    >
      <Icon name="image" class="opacity-50" />
      <p class="text-sm">
        {dropPrompt}
        <span class="text-primary-500 underline">{m.upload_browse()}</span>
      </p>
      {#if accept.includes('image')}
        <p class="text-xs opacity-60">{m.upload_constraints({ size: sizeLabel(MAX_IMAGE_SIZE) })}</p>
      {/if}
      {#if accept.includes('video')}
        <p class="text-xs opacity-60">{m.upload_constraintsVideo({ size: sizeLabel(MAX_VIDEO_SIZE) })}</p>
      {/if}
      <FileUpload.HiddenInput />
    </FileUpload.Dropzone>
  </FileUpload.Provider>

  {#each rejections as rejection, index (index)}
    <p class="text-error-500 text-sm">{rejection}</p>
  {/each}

  {#if uploads.length > 0}
    <ul class="space-y-2">
      {#each uploads as upload (upload)}
        <li class="card preset-filled-surface-100-900 flex items-center gap-3 p-2">
          {#if upload.kind === 'video'}
            <!-- An <img> can't render a video object URL — a muted <video> shows the first frame. -->
            <video
              src={upload.previewUrl}
              muted
              playsinline
              preload="metadata"
              class="size-12 rounded object-cover"
            ></video>
          {:else}
            <img src={upload.previewUrl} alt={upload.file.name} class="size-12 rounded object-cover" />
          {/if}

          <div class="min-w-0 flex-1">
            <p class="truncate text-sm">{upload.file.name}</p>

            {#if upload.status === 'failed'}
              <p class="text-error-500 text-xs">{upload.error ?? m.upload_failed()}</p>
            {:else if upload.status === 'uploading'}
              <Progress value={Math.round(upload.progress * 100)}>
                <Progress.Track class="bg-surface-300-700 mt-1 h-1 overflow-hidden rounded">
                  <Progress.Range class="bg-primary-500 h-full" />
                </Progress.Track>
              </Progress>
            {:else}
              <p class="text-xs opacity-60">{sizeLabel(upload.file.size)}</p>
            {/if}
          </div>

          {#if upload.status === 'failed'}
            <button
              type="button"
              class="btn-icon preset-tonal"
              aria-label={m.common_retry()}
              onclick={() => upload.retry().catch(() => {})}
            >
              <Icon name="sync" size={16} />
            </button>
          {:else if upload.status === 'finalizing'}
            <LoadingIndicator class="w-fit shrink-0" size={4} />
          {:else if upload.status === 'done'}
            <Icon name="check" size={16} class="text-success-500" />
          {/if}

          {#if upload.status !== 'finalizing' && upload.status !== 'done'}
            <button
              type="button"
              class="btn-icon preset-tonal"
              aria-label={m.common_remove()}
              onclick={() => remove(upload)}
            >
              <Icon name="close" size={16} />
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
