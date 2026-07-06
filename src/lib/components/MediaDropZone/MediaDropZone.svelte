<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { addUploads, ImageUpload, VideoUpload, type MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import {
    isImageFileName,
    isVideoFile,
    MAX_IMAGE_SIZE,
    MAX_VIDEO_SIZE,
    type MediaKind,
  } from '$lib/entities/file/upload'
  import { m } from '$lib/paraglide/messages'
  import { FileUpload, useFileUpload } from '@skeletonlabs/skeleton-svelte'
  import type { FileError } from '@zag-js/file-upload'

  interface Props {
    /** Pending uploads, bound so the form can finalize them once the entity exists. */
    uploads?: MediaUpload[]
    /** What this field takes: images only (topos) or images + videos (ascents). */
    accept?: MediaKind[]
    /** Split the Add tile into "photos" and "video with a source URL" (route uploads:
     *  reposted beta clips credit where they came from). Needs `accept` to include video. */
    videoSource?: boolean
    disabled?: boolean
  }

  let { uploads = $bindable([]), accept = ['image'], videoSource = false, disabled = false }: Props = $props()
  const id = $props.id()

  let rejections = $state<string[]>([])

  // Split mode: the Add tile opens a photos-or-video sheet instead of the bare file
  // picker. ponytail: drag and drop only works in the plain (non-split) mode.
  const split = $derived(videoSource && accept.includes('video'))
  let sheetOpen = $state(false)
  let sheetStep = $state<'choose' | 'video'>('choose')
  let sheetVideo = $state<File | null>(null)
  let sheetError = $state<string | null>(null)
  let sourceRaw = $state('')
  let photoInput: HTMLInputElement | undefined = $state()
  let videoInput: HTMLInputElement | undefined = $state()

  const normalizedSource = $derived.by(() => {
    const raw = sourceRaw.trim()
    if (raw === '') {
      return undefined
    }
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  })
  const sourceValid = $derived.by(() => {
    if (normalizedSource == null) {
      return true
    }
    try {
      return new URL(normalizedSource).hostname.includes('.')
    } catch {
      return false
    }
  })

  const openSheet = () => {
    sheetStep = 'choose'
    sheetVideo = null
    sheetError = null
    sourceRaw = ''
    sheetOpen = true
  }

  const addPickedPhotos = (list: FileList | null) => {
    if (list == null) {
      return
    }
    rejections = []
    const ok: File[] = []
    for (const file of list) {
      if (!isImageFileName(file.name)) {
        rejections.push(`${file.name}: ${m.upload_invalidType()}`)
      } else if (file.size > MAX_IMAGE_SIZE) {
        rejections.push(`${file.name}: ${m.upload_tooLarge({ size: sizeLabel(MAX_IMAGE_SIZE) })}`)
      } else {
        ok.push(file)
      }
    }
    uploads.push(...addUploads(ok, ImageUpload))
  }

  const pickSheetVideo = (list: FileList | null) => {
    const file = list?.[0]
    if (file == null) {
      return
    }
    if (!isVideoFile(file)) {
      sheetError = m.upload_invalidType()
    } else if (file.size > MAX_VIDEO_SIZE) {
      sheetError = m.upload_tooLarge({ size: sizeLabel(MAX_VIDEO_SIZE) })
    } else {
      sheetError = null
      sheetVideo = file
    }
  }

  const confirmSheetVideo = () => {
    if (sheetVideo == null || !sourceValid) {
      return
    }
    const [upload] = addUploads([sheetVideo], VideoUpload)
    upload.source = normalizedSource
    uploads.push(upload)
    sheetOpen = false
  }

  // Without an explicit maxFiles zag defaults to 1 (single-select) and rejects
  // any multi-file drop wholesale.
  const MAX_FILES = 10

  const rejectionMessage = (file: File, errors: FileError[]): string =>
    // An out-of-accept file that is also oversized carries both errors, the
    // type mismatch is the real reason, so it wins over the size complaint.
    errors.includes('FILE_INVALID_TYPE')
      ? m.upload_invalidType()
      : errors.includes('FILE_TOO_LARGE')
        ? m.upload_tooLarge({ size: sizeLabel(isVideoFile(file) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE) })
        : errors.includes('TOO_MANY_FILES')
          ? m.upload_tooMany({ count: MAX_FILES })
          : m.upload_invalidType()

  /** Which pipeline a file belongs to, if any, images win when both match. */
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
    // Our uploads are the source of truth, reset zag's own list so re-picking
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
    // our own accident/abuse knob (2GB, Bunny itself has no limit).
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
      // fails zag's `image/*`/`video/*` check, rescue by file name.
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

{#snippet videoFooter()}
  <button
    type="button"
    class="btn btn-sm preset-filled-primary-500"
    disabled={sheetVideo == null || !sourceValid}
    onclick={confirmSheetVideo}
  >
    {m.upload_addVideoConfirm()}
  </button>
{/snippet}

<div class="space-y-2">
  <FileUpload.Provider value={fileUpload}>
    <div class="flex flex-wrap gap-2">
      {#if split}
        <input
          accept="image/*,.heic,.heif"
          bind:this={photoInput}
          class="hidden"
          multiple
          onchange={(event) => {
            addPickedPhotos(event.currentTarget.files)
            event.currentTarget.value = ''
          }}
          type="file"
        />
        <Modal
          backdrop
          bind:open={sheetOpen}
          footer={sheetStep === 'video' ? videoFooter : undefined}
          snapPoints={sheetStep === 'video' ? [0.75] : [0.4]}
          title={sheetStep === 'video' ? m.upload_addVideo() : m.upload_addMediaTitle()}
        >
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              {disabled}
              class="border-surface-400-600 hover:bg-surface-100-900 flex aspect-square h-26 w-26 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed disabled:cursor-not-allowed disabled:opacity-50"
              onclick={openSheet}
            >
              <span
                class="bg-primary-500/15 text-primary-400 flex size-9 min-h-9 min-w-9 items-center justify-center rounded-lg"
              >
                <Icon name="plus" size={17} />
              </span>
              <span class="text-surface-600-400 text-xs font-semibold">{m.common_add()}</span>
            </button>
          {/snippet}

          {#if sheetStep === 'choose'}
            <div class="flex flex-col gap-0.5">
              <button
                type="button"
                class="hover:bg-surface-100-900 -mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 text-left"
                onclick={() => {
                  sheetOpen = false
                  photoInput?.click()
                }}
              >
                <span
                  class="bg-primary-500/15 text-primary-400 flex size-10 flex-none items-center justify-center rounded-xl"
                >
                  <Icon name="image" size={18} />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-semibold">{m.upload_addPhotos()}</span>
                  <span class="text-surface-600-400 block text-xs">{m.upload_addPhotosHint()}</span>
                </span>
              </button>

              <!-- stopPropagation: the step switch detaches this button before the click
                   bubbles to the sheet's outside-click handler, which would close it. -->
              <button
                type="button"
                class="hover:bg-surface-100-900 -mx-2 flex items-center gap-3 rounded-xl px-2 py-1.5 text-left"
                onclick={(event) => {
                  event.stopPropagation()
                  sheetStep = 'video'
                }}
              >
                <span
                  class="bg-primary-500/15 text-primary-400 flex size-10 flex-none items-center justify-center rounded-xl"
                >
                  <Icon name="play" size={18} />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-semibold">{m.upload_addVideo()}</span>
                  <span class="text-surface-600-400 block text-xs">{m.upload_addVideoHint()}</span>
                </span>
              </button>
            </div>
          {:else}
            <div class="space-y-3">
              <!-- Lives inside the sheet content: a programmatic click on it bubbles to the
                   document, and coming from outside the sheet's DOM it would read as an
                   outside click and close the sheet. -->
              <input
                accept="video/*"
                bind:this={videoInput}
                class="hidden"
                onchange={(event) => {
                  pickSheetVideo(event.currentTarget.files)
                  event.currentTarget.value = ''
                }}
                type="file"
              />
              <p class="text-surface-600-400 text-sm">{m.upload_videoSheetBody()}</p>

              {#if sheetVideo == null}
                <button
                  type="button"
                  class="border-surface-400-600 hover:bg-surface-100-900 flex w-full items-center gap-3 rounded-xl border-[1.5px] border-dashed p-3 text-left"
                  onclick={() => videoInput?.click()}
                >
                  <span
                    class="bg-primary-500/15 text-primary-400 flex size-9 flex-none items-center justify-center rounded-lg"
                  >
                    <Icon name="play" size={16} />
                  </span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">{m.upload_chooseVideo()}</span>
                    <span class="text-surface-600-400 block text-xs">{m.upload_chooseVideoHint()}</span>
                  </span>
                </button>
              {:else}
                <div class="border-surface-300-700 bg-surface-100-900 flex items-center gap-3 rounded-xl border p-3">
                  <span
                    class="bg-primary-500/15 text-primary-400 flex size-9 flex-none items-center justify-center rounded-lg"
                  >
                    <Icon name="play" size={16} />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold">{sheetVideo.name}</span>
                    <span class="text-surface-600-400 block text-xs">{sizeLabel(sheetVideo.size)}</span>
                  </span>
                  <button
                    type="button"
                    class="btn btn-sm preset-tonal-surface flex-none"
                    onclick={() => videoInput?.click()}
                  >
                    {m.upload_change()}
                  </button>
                </div>
              {/if}
              {#if sheetError != null}
                <p class="text-error-500 text-sm">{sheetError}</p>
              {/if}

              <div class="space-y-1.5">
                <label class="text-surface-700-300 block text-sm font-semibold" for="{id}-video-source">
                  {m.upload_sourceLabel()}
                </label>
                <input
                  autocomplete="off"
                  bind:value={sourceRaw}
                  class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-3 py-2.5 font-mono text-sm focus:ring-0 focus:outline-none"
                  id="{id}-video-source"
                  inputmode="url"
                  placeholder={m.upload_sourcePlaceholder()}
                  type="text"
                />
                <p class={['text-sm', sourceValid ? 'text-surface-600-400' : 'text-error-500']}>
                  {sourceValid ? m.upload_sourceHint() : m.upload_sourceInvalid()}
                </p>
              </div>
            </div>
          {/if}
        </Modal>
      {:else}
        <FileUpload.Dropzone
          class="border-surface-400-600 hover:bg-surface-100-900 data-dragging:border-primary-500 data-dragging:bg-primary-500/10 flex aspect-square h-26 w-26 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed data-disabled:cursor-not-allowed data-disabled:opacity-50"
        >
          <span
            class="bg-primary-500/15 text-primary-400 flex size-9 min-h-9 min-w-9 items-center justify-center rounded-lg"
          >
            <Icon name="plus" size={17} />
          </span>
          <span class="text-surface-600-400 text-xs font-semibold">{m.common_add()}</span>
          <span class="sr-only">{dropPrompt} {m.upload_browse()}</span>
          <FileUpload.HiddenInput />
        </FileUpload.Dropzone>
      {/if}

      {#each uploads as upload (upload)}
        <div class="border-surface-300-700 bg-surface-100-900 relative h-26 w-26 overflow-hidden rounded-xl border">
          {#if upload.kind === 'video'}
            <!-- An <img> can't render a video object URL, a muted <video> shows the first frame. -->
            <video
              src={upload.previewUrl}
              muted
              playsinline
              preload="metadata"
              class="h-full w-full object-cover"
            ></video>
            <span class="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                class="flex size-8.5 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
              >
                <Icon name="play" size={14} fill="currentColor" />
              </span>
            </span>
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
                onclick={() => upload.retry().catch(() => {})}
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

          {#if upload.status !== 'finalizing' && upload.status !== 'done'}
            <button
              type="button"
              class="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white"
              aria-label={m.common_remove()}
              onclick={() => remove(upload)}
            >
              <Icon name="close" size={12} />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </FileUpload.Provider>

  {#each rejections as rejection, index (index)}
    <p class="text-error-500 text-sm">{rejection}</p>
  {/each}
  {#each uploads.filter((upload) => upload.status === 'failed') as failed (failed)}
    <p class="text-error-500 text-sm">{failed.file.name}: {failed.error ?? m.upload_failed()}</p>
  {/each}

  <p class="text-surface-600-400 text-xs">
    {[
      ...(accept.includes('image') ? [m.upload_constraints({ size: sizeLabel(MAX_IMAGE_SIZE) })] : []),
      ...(accept.includes('video') ? [m.upload_constraintsVideo({ size: sizeLabel(MAX_VIDEO_SIZE) })] : []),
    ].join(' · ')}
  </p>
</div>
