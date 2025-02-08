<script lang="ts">
  import { page } from '$app/stores'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import BlockFormFields from '$lib/components/BlockFormFields'
  import FileUploadForm from '$lib/components/FileUploadForm'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  let { data, form } = $props()
  let basePath = $derived(`/areas/${$page.params.slugs}`)

  let loading = $state(false)
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

<FileUploadForm accept="image/*" bind:loading className="card mt-8 p-2 md:p-4 preset-filled-surface-100-900">
  {#snippet childrenBefore()}
    <BlockFormFields name={form?.name ?? `Block ${data.blocksCount + 1}`} />
  {/snippet}

  {#snippet childrenAfter()}
    <div class="flex justify-between mt-8">
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
  {/snippet}
</FileUploadForm>
