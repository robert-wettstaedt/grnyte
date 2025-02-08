<script lang="ts" module>
  export interface FileUploadFormProps {
    accept?: string
    action?: string
    className?: string
    folderName?: string | null
    loading?: boolean
    label?: string

    childrenBefore?: Snippet
    childrenAfter?: Snippet
  }
</script>

<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/stores'
  import { config } from '$lib/config'
  import { convertException } from '$lib/errors'
  import { Progress } from '@skeletonlabs/skeleton-svelte'
  import { onDestroy, onMount, type Snippet } from 'svelte'
  import { uploadData, type Progress as FileUploadProgress } from './action'
  import { getThumbnail } from './video'

  let {
    action,
    accept = 'image/*,video/*',
    className,
    folderName,
    label = 'File Input',
    loading = $bindable(false),
    childrenBefore,
    childrenAfter,
  }: FileUploadFormProps = $props()

  let progress = $state<FileUploadProgress | null>(null)
  let error = $state<string | null>(null)
  let controller = $state<AbortController | null>(null)

  let thumbnail: string | undefined = $state(undefined)

  const handleChange = async (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    thumbnail = undefined

    if (file?.type.startsWith('image/')) {
      thumbnail = URL.createObjectURL(file)
    } else if (file?.type.startsWith('video/')) {
      const result = await getThumbnail(file)
      thumbnail = URL.createObjectURL(new Blob([result], { type: file.type }))
    }
  }

  onMount(() => {
    controller = new AbortController()
  })

  onDestroy(() => {
    controller?.abort()
  })
</script>

<form
  {action}
  class={className}
  enctype="multipart/form-data"
  method="POST"
  use:enhance={async ({ formData }) => {
    error = null
    loading = true
    progress = null

    try {
      await uploadData(formData, $page.data, controller?.signal, (_progress) => (progress = _progress))

      return async ({ update }) => {
        const returnValue = await update()
        loading = false
        return returnValue
      }
    } catch (exception) {
      error = convertException(exception)
      loading = false
      progress = null
    }
  }}
>
  {#if childrenBefore}
    {@render childrenBefore()}
  {/if}

  {#if error}
    <aside class="card preset-tonal-warning my-8 p-2 md:p-4 whitespace-pre-line">
      <p>{error}</p>
    </aside>
  {/if}

  <label class="label mt-4">
    <span class="label">{label} (max {config.files.maxSize.human})</span>
    <input class="input" onchange={handleChange} name="files" type="file" {accept} />

    <input type="hidden" name="folderName" value={folderName} />
  </label>

  <div class="relative">
    {#if thumbnail == null}
      {#if loading}
        <Progress max={100} meterBg="bg-primary-500" value={progress?.percentage} />
      {/if}
    {:else}
      <img
        alt="Thumbnail"
        class="w-full h-[200px] object-contain bg-surface-50-950"
        onerror={() => (thumbnail = undefined)}
        src={thumbnail}
      />
    {/if}

    {#if progress != null}
      <div class="{thumbnail == null ? '' : 'absolute bottom-0 left-0 right-0 bg-black/50'} flex justify-between">
        {#if thumbnail != null}
          <div class="absolute bottom-0 left-0 h-full bg-primary-500" style="width: {progress?.percentage}%"></div>
        {/if}

        <span class="relative p-2">{progress.step}</span>
        <span class="relative p-2">{Math.round(progress.percentage)}%</span>
      </div>
    {/if}
  </div>

  {#if childrenAfter}
    {@render childrenAfter()}
  {/if}
</form>
