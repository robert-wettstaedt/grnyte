<script>
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FormActionBar from '$lib/components/FormActionBar'
  import RegionFormFields from '$lib/components/RegionFormFields'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { createRegion } from './page.remote'

  let isValid = $state(false)
</script>

<svelte:head>
  <title>Create region - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>Create region</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createRegion.enhance(enhanceForm())}>
  <RegionFormFields name={''} onChange={(valid) => (isValid = valid)} settings={{ mapLayers: [] }} />

  <FormActionBar disabled={!isValid} label="Save region" pending={createRegion.pending} />
</form>
