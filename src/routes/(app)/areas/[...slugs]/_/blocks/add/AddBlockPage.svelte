<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import BlockFormFields from '$lib/components/BlockFormFields'
  import FormActionBar from '$lib/components/FormActionBar'
  import { getAreaContext } from '$lib/contexts/area'
  import { enhanceForm, type EnhanceState } from '$lib/forms/enhance.svelte'
  import { createBlock } from './page.remote'

  interface Props {
    name: string
  }

  let { name }: Props = $props()
  const { area } = getAreaContext()
  let basePath = $derived(`/areas/${page.params.slugs}`)
  let state = $state<EnhanceState>({})
</script>

<svelte:head>
  <title>Create block in {area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Create block in</span>
    <a class="anchor" href={basePath}>{area.name}</a>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createBlock.enhance(enhanceForm(state))}>
  <BlockFormFields {name} areaFk={area.id} fileUploadProps={{ state }} />

  <FormActionBar {state} label="Save block" pending={createBlock.pending} />
</form>
