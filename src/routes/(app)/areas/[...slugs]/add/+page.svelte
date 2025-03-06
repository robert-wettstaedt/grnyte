<script>
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import AreaFormFields from '$lib/components/AreaFormFields'

  let { data, form } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)
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

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" method="POST" use:enhance>
  <AreaFormFields
    description={form?.description ?? ''}
    hasParent={data.parent != null}
    name={form?.name ?? ''}
    type={form?.type ?? 'area'}
    visibility={form?.visibility ?? 'public'}
  />

  <div class="mt-8 flex justify-between">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    <button class="btn preset-filled-primary-500" type="submit">
      <i class="fa-solid fa-floppy-disk"></i> Save area
    </button>
  </div>
</form>
