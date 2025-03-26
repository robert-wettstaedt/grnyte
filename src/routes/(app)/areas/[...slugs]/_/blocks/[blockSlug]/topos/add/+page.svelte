<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import FileUpload, { enhanceWithFile } from '$lib/components/FileUpload'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  let { data, form } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let loading = $state(false)
  let uploadProgress = $state<number | null>(null)
  let uploadError = $state<string | null>(null)
</script>

<svelte:head>
  <title>Edit topos of {data.block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit topos of</span>
    <a class="anchor" href={basePath}>{data.block.name}</a>
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
  <FileUpload error={uploadError} progress={uploadProgress} folderName={form?.folderName} {loading} accept="image/*" />

  <input type="hidden" name="redirect" value={page.url.searchParams.get('redirect') ?? ''} />

  <p class="mt-8 text-sm text-gray-500">You can upload more topo images later.</p>

  <div class="mt-8 flex justify-between md:items-center">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    <button class="btn preset-filled-primary-500" type="submit" disabled={loading}>
      {#if loading}
        <span class="me-2">
          <ProgressRing size="size-4" value={null} />
        </span>
      {/if}

      Add file
    </button>
  </div>
</form>
