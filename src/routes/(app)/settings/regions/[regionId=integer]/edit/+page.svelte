<script>
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import RegionFormFields from '$lib/components/RegionFormFields'

  let { data, form } = $props()

  let isValid = $state(false)
</script>

<svelte:head>
  <title>Edit {data.region.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit {data.region.name}</span>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" method="POST" use:enhance>
  <RegionFormFields
    name={form?.name ?? data.region.name}
    onChange={(valid) => (isValid = valid)}
    settings={form?.settings ?? data.region.settings}
  />

  <div class="mt-8 flex justify-between md:items-center">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    <button class="btn preset-filled-primary-500" disabled={!isValid} type="submit">
      <i class="fa-solid fa-floppy-disk"></i> Save region
    </button>
  </div>
</form>
