<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import SourceField from '$lib/components/Media/SourceField.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { imageRejectionMessage } from '$lib/entities/file/rejection'
  import {
    formatFileSize,
    imageRejection,
    isImageFileName,
    isValidSource,
    isVideoFile,
    MAX_IMAGE_SIZE,
    MAX_VIDEO_SIZE,
    normalizeSource,
    type MediaKind,
  } from '$lib/entities/file/upload'
  import {
    addUploads,
    finalizeMediaUploads,
    ImageUpload,
    retryPending,
    VideoUpload,
    type MediaUpload,
    type MediaUploadTarget,
  } from '$lib/entities/file/upload-manager.svelte'
  import { m } from '$lib/paraglide/messages'
  import { toaster } from '$lib/state/toast'
  import { FileUpload, useFileUpload } from '@skeletonlabs/skeleton-svelte'
  import MediaUploadTile from './MediaUploadTile.svelte'

  interface Props {
    /** What this field takes: images only (topos) or images + videos (ascents). */
    accept?: MediaKind[]
    /** Tile mode only: size the Add tile like a form field (a form's strip is smaller
     *  than a page's), so it doesn't tower over the same control on the sibling screens. */
    compact?: boolean
    disabled?: boolean
    /** When set, the entity already exists: each pick finalizes against it right away
     *  (no form submit to wait for) and its tile shows on the target page from the
     *  global registry, so this field renders only the Add control. */
    target?: MediaUploadTarget
    /** Pending uploads, bound so the form can finalize them once the entity exists. */
    uploads?: MediaUpload[]
    /** Split the Add tile into "photos" and "video with a source URL" (route uploads:
     *  reposted beta clips credit where they came from). Needs `accept` to include video. */
    videoSource?: boolean
  }

  let {
    accept = ['image'],
    compact = false,
    disabled = false,
    target,
    uploads = $bindable([]),
    videoSource = false,
  }: Props = $props()
  const id = $props.id()

  // Tile mode (has a target): render just the Add tile, sized to sit in a media strip.
  // The uploads finalize on pick and their tiles show on the target page, so this field
  // drops its own tile grid, constraints line, and inline rejections.
  const tile = $derived(target != null)

  // Finalize on pick when we have a target, otherwise hand the uploads to the form to finalize on submit.
  const commit = (news: MediaUpload[]) => {
    if (target != null) {
      void finalizeMediaUploads(news, target)
    } else {
      uploads.push(...news)
    }
  }

  let rejections = $state<string[]>([])

  // Inline under the field in a form; a toast in tile mode, which has no inline slot for them.
  const reportRejections = (list: string[]) => {
    if (tile) {
      list.forEach((message) => toaster.create({ duration: 5000, title: message, type: 'error' }))
    } else {
      rejections = list
    }
  }

  // Split mode: the Add tile opens a photos-or-video sheet instead of the bare file
  // picker. ponytail: drag and drop only works in the plain (non-split) mode.
  const split = $derived(videoSource && accept.includes('video'))
  let sheetOpen = $state(false)
  let sheetStep = $state<'choose' | 'video'>('choose')
  let sheetVideo = $state<File | null>(null)
  let sheetError = $state<null | string>(null)
  let sourceRaw = $state('')
  let photoInput: HTMLInputElement | undefined = $state()
  let videoInput: HTMLInputElement | undefined = $state()

  const normalizedSource = $derived(normalizeSource(sourceRaw))
  const sourceValid = $derived(isValidSource(normalizedSource))

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
    const ok: File[] = []
    const rejected: string[] = []
    for (const file of list) {
      const rejection = imageRejection(file)
      if (rejection == null) {
        ok.push(file)
      } else {
        rejected.push(`${file.name}: ${imageRejectionMessage(rejection)}`)
      }
    }
    // zag only enforces maxFiles for the plain dropzone; this picker caps itself, or
    // one native pick could start an unbounded number of parallel staging uploads.
    // ponytail: tile mode caps per pick (the field holds nothing between picks).
    const remaining = Math.max(0, MAX_FILES - (tile ? 0 : uploads.length))
    if (ok.length > remaining) {
      rejected.push(m.upload_tooMany({ count: MAX_FILES }))
      ok.length = remaining
    }
    reportRejections(rejected)
    commit(addUploads(ok, ImageUpload))
  }

  const pickSheetVideo = (list: FileList | null) => {
    const file = list?.[0]
    if (file == null) {
      return
    }
    if (!isVideoFile(file)) {
      sheetError = m.upload_invalidType()
    } else if (file.size > MAX_VIDEO_SIZE) {
      sheetError = m.upload_tooLarge({ size: formatFileSize(MAX_VIDEO_SIZE) })
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
    commit([upload])
    sheetOpen = false
  }

  // Without an explicit maxFiles zag defaults to 1 (single-select) and rejects
  // any multi-file drop wholesale.
  const MAX_FILES = 10

  const rejectionMessage = (file: File, errors: readonly string[]): string =>
    // An out-of-accept file that is also oversized carries both errors, the
    // type mismatch is the real reason, so it wins over the size complaint.
    errors.includes('FILE_INVALID_TYPE')
      ? m.upload_invalidType()
      : errors.includes('FILE_TOO_LARGE')
        ? m.upload_tooLarge({ size: formatFileSize(isVideoFile(file) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE) })
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
    const rejected: string[] = []
    for (const file of files) {
      const kind = kindOf(file)
      if (kind === 'image') {
        images.push(file)
      } else if (kind === 'video') {
        videos.push(file)
      } else {
        rejected.push(`${file.name}: ${m.upload_invalidType()}`)
      }
    }
    reportRejections(rejected)
    commit([...addUploads(images, ImageUpload), ...addUploads(videos, VideoUpload)])
    // Our uploads are the source of truth, reset zag's own list so re-picking
    // the same file isn't rejected as a duplicate.
    fileUpload().clearFiles()
  }

  const fileUpload = useFileUpload(() => ({
    accept: [
      ...(accept.includes('image') ? ['image/*', '.heic', '.heif'] : []),
      ...(accept.includes('video') ? ['video/*'] : []),
    ],
    disabled,
    id,
    maxFiles: MAX_FILES,
    onFileAccept: (details) => addFiles(details.files),
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
      reportRejections(
        details.files
          .filter((rejection) => !rescued.includes(rejection.file))
          .map((rejection) => `${rejection.file.name}: ${rejectionMessage(rejection.file, rejection.errors)}`),
      )
    },
    // Size limits are per pipeline, so they live here instead of a blanket
    // `maxFileSize`: images are capped by the staging bucket (50MB), videos by
    // our own accident/abuse knob (2GB, Bunny itself has no limit).
    validate: (file) => (file.size > (isVideoFile(file) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE) ? ['FILE_TOO_LARGE'] : null),
  }))

  const remove = (upload: MediaUpload) => {
    upload.remove()
    uploads.splice(uploads.indexOf(upload), 1)
  }

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

<!-- The photos-or-video sheet picker; `tileClass` sizes the Add tile for its context. -->
{#snippet splitPicker(tileClass: string)}
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
        class={[
          'border-surface-400-600 hover:bg-surface-100-900 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed disabled:cursor-not-allowed disabled:opacity-50',
          tileClass,
        ]}
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
              <span class="text-surface-600-400 block text-xs">{formatFileSize(sheetVideo.size)}</span>
            </span>
            <button type="button" class="btn btn-sm preset-tonal-surface flex-none" onclick={() => videoInput?.click()}>
              {m.upload_change()}
            </button>
          </div>
        {/if}
        {#if sheetError != null}
          <p class="text-error-500 text-sm">{sheetError}</p>
        {/if}

        <SourceField bind:value={sourceRaw} valid={sourceValid} />
      </div>
    {/if}
  </Modal>
{/snippet}

<!-- The plain drag-and-drop picker (images only); `tileClass` sizes the Add tile. -->
{#snippet plainPicker(tileClass: string)}
  <FileUpload.Dropzone
    class={[
      'border-surface-400-600 hover:bg-surface-100-900 data-dragging:border-primary-500 data-dragging:bg-primary-500/10 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed data-disabled:cursor-not-allowed data-disabled:opacity-50',
      tileClass,
    ]}
  >
    <span class="bg-primary-500/15 text-primary-400 flex size-9 min-h-9 min-w-9 items-center justify-center rounded-lg">
      <Icon name="plus" size={17} />
    </span>
    <span class="text-surface-600-400 text-xs font-semibold">{m.common_add()}</span>
    <span class="sr-only">{dropPrompt} {m.upload_browse()}</span>
    <FileUpload.HiddenInput />
  </FileUpload.Dropzone>
{/snippet}

{#if tile}
  <!-- Tile mode: just the Add tile, sized to sit as the leading item of a media strip. -->
  {@const tileClass = `${compact ? 'h-26 w-26' : 'h-40 w-40'} flex-none snap-start`}
  {#if split}
    {@render splitPicker(tileClass)}
  {:else}
    <!-- `contents`: zag's root is a real div that fills its flex line, which would push the
         rest of the strip to the far edge. Take it out of the layout so the tile is the item. -->
    <FileUpload.Provider class="contents" value={fileUpload}>
      {@render plainPicker(tileClass)}
    </FileUpload.Provider>
  {/if}
{:else}
  <div class="space-y-2">
    <FileUpload.Provider value={fileUpload}>
      <div class="flex flex-wrap gap-2">
        {#if split}
          {@render splitPicker('aspect-square h-26 w-26')}
        {:else}
          {@render plainPicker('aspect-square h-26 w-26')}
        {/if}

        {#each uploads as upload (upload)}
          <MediaUploadTile {upload} onRetry={() => void retryPending(upload)} onRemove={() => remove(upload)} />
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
        ...(accept.includes('image') ? [m.upload_constraints({ size: formatFileSize(MAX_IMAGE_SIZE) })] : []),
        ...(accept.includes('video') ? [m.upload_constraintsVideo({ size: formatFileSize(MAX_VIDEO_SIZE) })] : []),
      ].join(' · ')}
    </p>
  </div>
{/if}
