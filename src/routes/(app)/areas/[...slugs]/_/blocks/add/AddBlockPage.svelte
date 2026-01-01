<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import BlockFormFields from '$lib/components/BlockFormFields'
  import { enhanceWithFile } from '$lib/components/FileUpload/enhance.svelte'
  import FormActionBar from '$lib/components/FormActionBar'
  import { getAreaContext } from '$lib/contexts/area'
  import type { Row } from '$lib/db/zero'
  import type { EnhanceState } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { createBlock } from './page.remote'

  interface Props {
    name: Row<'blocks'>['name']
  }

  let { name = $bindable() }: Props = $props()
  const { area } = getAreaContext()
  let basePath = $derived(`/areas/${page.params.slugs}`)
  let state = $state<EnhanceState>({})
</script>

<svelte:head>
  <title>Create block in {area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      Create block in
      <a class="anchor" href={basePath}>{area.name}</a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  {...createBlock.enhance(enhanceWithFile(state))}
  enctype="multipart/form-data"
>
  <BlockFormFields bind:name areaFk={area.id} fileUploadProps={{ state }} />

  <FormActionBar label="Save block" pending={createBlock.pending} />
</form>
