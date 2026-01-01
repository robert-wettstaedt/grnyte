<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import FormActionBar from '$lib/components/FormActionBar'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import type { Snapshot } from './$types'
  import { createArea } from './page.remote'

  let description: Partial<Row<'areas'>>['description'] = $state()
  let name: Partial<Row<'areas'>>['name'] = $state()
  let regionFk: Partial<Row<'areas'>>['regionFk'] = $state()

  export const snapshot: Snapshot<Partial<Row<'areas'>>> = {
    capture: () => ({ description, name, regionFk }),
    restore: (snapshot) => {
      description = snapshot.description
      name = snapshot.name
      regionFk = snapshot.regionFk
    },
  }
</script>

<svelte:head>
  <title>Create area - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>Create area</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createArea.enhance(enhanceForm())}>
  <AreaFormFields parentFk={undefined} bind:description bind:name bind:regionFk />

  <FormActionBar label="Save area" pending={createArea.pending} />
</form>
