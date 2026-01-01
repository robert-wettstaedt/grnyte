<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FileUpload from '$lib/components/FileUpload'
  import { enhanceWithFile } from '$lib/components/FileUpload/enhance.svelte'
  import FormActionBar from '$lib/components/FormActionBar'
  import { getBlockContext } from '$lib/contexts/block'
  import type { EnhanceState } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { addTopo } from './page.remote'

  const { block } = getBlockContext()

  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let state = $state<EnhanceState>({})
</script>

<svelte:head>
  <title>Edit topos of {block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      Edit topos of
      <a class="anchor" href={basePath}>{block.name}</a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  {...addTopo.enhance(enhanceWithFile(state))}
  enctype="multipart/form-data"
>
  <FileUpload {state} accept="image/*" />

  <input type="hidden" name="redirect" value={page.url.searchParams.get('redirect') ?? ''} />
  <input type="hidden" name="blockId" value={block.id} />

  <p class="mt-8 text-sm text-gray-500">You can upload more topo images later.</p>

  <FormActionBar label="Add file" pending={addTopo.pending} />
</form>
