<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { invalidateCache } from '$lib/cache/cache'
  import AppBar from '$lib/components/AppBar'
  import BlockFormFields from '$lib/components/BlockFormFields'
  import { enhanceWithFile } from '$lib/components/FileUpload/action'
  import { config } from '$lib/config'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  let { data, form } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)

  let loading = $state(false)
  let uploadProgress = $state<number | null>(null)
  let uploadError = $state<string | null>(null)
</script>

<svelte:head>
  <title>Create block in {data.area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Create block in</span>
    <a class="anchor" href={basePath}>{data.area.name}</a>
  {/snippet}
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  enctype="multipart/form-data"
  method="POST"
  use:enhanceWithFile={{
    session: data.session,
    supabase: data.supabase,
    onSubmit: async () => {
      loading = true

      return async ({ update }) => {
        const returnValue = await update()
        loading = false
        await invalidateCache(config.cache.keys.layoutBlocks)
        await invalidateCache(config.cache.keys.layoutBlocksHash)

        return returnValue
      }
    },
    onError: (error) => {
      uploadError = error
      loading = false
    },
    onProgress: (percentage) => (uploadProgress = percentage),
  }}
>
  <BlockFormFields
    fileUploadProps={{
      error: uploadError,
      folderName: form?.folderName,
      loading,
      progress: uploadProgress,
    }}
    name={form?.name ?? `Block ${data.blocksCount + 1}`}
  />

  <div class="mt-8 flex justify-between md:items-center">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    <button class="btn preset-filled-primary-500" type="submit" disabled={loading}>
      {#if loading}
        <span class="me-2">
          <ProgressRing size="size-4" value={null} />
        </span>
      {:else}
        <i class="fa-solid fa-floppy-disk"></i>
      {/if}

      Save block
    </button>
  </div>
</form>
