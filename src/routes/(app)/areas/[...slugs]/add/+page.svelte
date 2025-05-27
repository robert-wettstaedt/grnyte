<script>
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { invalidateCache } from '$lib/cache/cache'
  import AppBar from '$lib/components/AppBar'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import { config } from '$lib/config'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  let { data, form } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)

  let loading = $state(false)
</script>

<svelte:head>
  {#if data.parent}
    <title>Create area in {data.parent.name} - {PUBLIC_APPLICATION_NAME}</title>
  {:else}
    <title>Create area - {PUBLIC_APPLICATION_NAME}</title>
  {/if}
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Create area</span>
    {#if data.parent != null}
      <span>in</span>
      <a class="anchor" href={basePath}>{data.parent.name}</a>
    {/if}
  {/snippet}
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  method="POST"
  use:enhance={() => {
    loading = true

    return async ({ update }) => {
      loading = false
      await invalidateCache(config.cache.keys.layoutBlocks)
      await invalidateCache(config.cache.keys.layoutBlocksHash)

      return update()
    }
  }}
>
  <AreaFormFields
    description={form?.description ?? ''}
    hasParent={data.parent != null}
    name={form?.name ?? ''}
    regionFk={form?.regionFk ?? data.parent?.regionFk}
    type={form?.type ?? 'area'}
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

      Save area
    </button>
  </div>
</form>
