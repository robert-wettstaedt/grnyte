<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import FormActionBar from '$lib/components/FormActionBar'
  import { getAreaContext } from '$lib/contexts/area'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { createArea } from './../../add/page.remote'

  interface Props {
    description: Partial<Row<'areas'>>['description']
    name: Partial<Row<'areas'>>['name']
    type: Partial<Row<'areas'>>['type']
  }

  let { description = $bindable(), name = $bindable(), type = $bindable() }: Props = $props()

  const { area } = getAreaContext()
  let basePath = $derived(`/areas/${page.params.slugs}`)
</script>

<svelte:head>
  {#if area == null}
    <title>Create area - {PUBLIC_APPLICATION_NAME}</title>
  {:else}
    <title>Create area in {area.name} - {PUBLIC_APPLICATION_NAME}</title>
  {/if}
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      Create area
      {#if area != null}
        in
        <a class="anchor" href={basePath}>{area.name}</a>
      {/if}
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createArea.enhance(enhanceForm())}>
  <AreaFormFields bind:description bind:name bind:type parentFk={area?.id} regionFk={area?.regionFk} />

  <FormActionBar label="Save area" pending={createArea.pending} />
</form>
