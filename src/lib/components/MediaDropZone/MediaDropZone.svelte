<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { config } from '$lib/config'
  import { addImageUploads, type ImageUpload } from '$lib/entities/file/upload-manager.svelte'
  import { isImageFileName, type MediaKind } from '$lib/entities/file/upload'
  import { m } from '$lib/paraglide/messages'
  import { FileUpload, Progress, useFileUpload } from '@skeletonlabs/skeleton-svelte'
  import type { FileError } from '@zag-js/file-upload'

  interface Props {
    /** Pending uploads, bound so the form can finalize them once the entity exists. */
    uploads?: ImageUpload[]
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

  const rejectionMessage = (errors: FileError[]): string =>
    errors.includes('FILE_TOO_LARGE')
      ? m.upload_tooLarge({ size: config.files.maxSize.human })
      : errors.includes('TOO_MANY_FILES')
        ? m.upload_tooMany({ count: MAX_FILES })
        : m.upload_invalidType()

  const addFiles = (files: File[]) => {
    // ponytail: only the image pipeline exists — video files route to Bunny TUS
    // once that flow lands; until then they surface as unsupported.
    const images = files.filter((file) => isImageFileName(file.name))
    uploads.push(...addImageUploads(images))
    rejections.push(
      ...files.filter((file) => !images.includes(file)).map((file) => `${file.name}: ${m.upload_invalidType()}`),
    )
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
    // `maxFileSize`: only images are capped (staging bucket, 50MB) — videos go
    // to Bunny via TUS (built for >100MB files) and get their own cap, if any,
    // when that flow lands.
    validate: (file) =>
      isImageFileName(file.name) && file.size > config.files.maxSize.number ? ['FILE_TOO_LARGE'] : null,
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
      // HEIC photos often carry an empty MIME type, which fails zag's
      // `image/*` check — rescue anything that is an image by file name.
      const rescued = details.files
        .filter((rejection) => rejection.errors.every((error) => error === 'FILE_INVALID_TYPE'))
        .map((rejection) => rejection.file)
        .filter((file) => isImageFileName(file.name))
      if (rescued.length > 0) {
        addFiles(rescued)
      }
      rejections = details.files
        .filter((rejection) => !rescued.includes(rejection.file))
        .map((rejection) => `${rejection.file.name}: ${rejectionMessage(rejection.errors)}`)
    },
  }))

  const remove = (upload: ImageUpload) => {
    upload.remove()
    uploads.splice(uploads.indexOf(upload), 1)
  }

  const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`
</script>

<div class="space-y-2">
  <FileUpload.Provider value={fileUpload}>
    <FileUpload.Dropzone
      class="border-surface-300-700 hover:border-surface-400-600 data-dragging:border-primary-500 data-dragging:bg-primary-500/10 flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed p-6 text-center data-disabled:cursor-not-allowed data-disabled:opacity-50"
    >
      <Icon name="image" class="opacity-50" />
      <p class="text-sm">
        {m.upload_dropPrompt()}
        <span class="text-primary-500 underline">{m.upload_browse()}</span>
      </p>
      <p class="text-xs opacity-60">{m.upload_constraints({ size: config.files.maxSize.human })}</p>
      <FileUpload.HiddenInput />
    </FileUpload.Dropzone>
  </FileUpload.Provider>

  {#each rejections as rejection, index (index)}
    <p class="text-error-500 text-sm">{rejection}</p>
  {/each}

  {#if uploads.length > 0}
    <ul class="space-y-2">
      {#each uploads as upload (upload.path)}
        <li class="card preset-filled-surface-100-900 flex items-center gap-3 p-2">
          <img src={upload.previewUrl} alt={upload.file.name} class="size-12 rounded object-cover" />

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
              <p class="text-xs opacity-60">{megabytes(upload.file.size)}</p>
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
