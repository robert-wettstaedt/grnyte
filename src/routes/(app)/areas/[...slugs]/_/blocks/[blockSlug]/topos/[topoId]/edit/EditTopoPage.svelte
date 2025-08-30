<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import FileUpload from '$lib/components/FileUpload'
  import { enhanceWithFile } from '$lib/components/FileUpload/enhance.svelte'
  import FormActionBar from '$lib/components/FormActionBar'
  import Image from '$lib/components/Image'
  import { getBlockContext } from '$lib/contexts/block'
  import type { RowWithRelations } from '$lib/db/zero'
  import type { EnhanceState } from '$lib/forms/enhance.svelte'
  import { replaceTopo } from './page.remote'

  interface Props {
    topo: RowWithRelations<'topos', { file: true }>
  }

  const { topo }: Props = $props()

  const { block } = getBlockContext()

  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let state = $state<EnhanceState>({})
</script>

<svelte:head>
  <title>Replace topo of {block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Replace topo of</span>
    <a class="anchor" href={basePath}>{block.name}</a>
  {/snippet}
</AppBar>

{#if topo.file?.path != null}
  <div class="mt-8 flex justify-center">
    <Image path="/nextcloud/{topo.file.path}" size={150} />
  </div>
{/if}

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  {...replaceTopo.enhance(enhanceWithFile(state))}
  enctype="multipart/form-data"
>
  <FileUpload {state} accept="image/*" />

  <input type="hidden" name="redirect" value={page.url.searchParams.get('redirect') ?? ''} />
  <input type="hidden" name="topoId" value={topo.id} />

  <FormActionBar label="Replace image" pending={replaceTopo.pending} />
</form>
