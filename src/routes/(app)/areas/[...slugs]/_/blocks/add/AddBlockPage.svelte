<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import BlockFormFields from '$lib/components/BlockFormFields'
  import { enhanceWithFile } from '$lib/components/FileUpload/enhance.svelte'
  import FormActionBar from '$lib/components/FormActionBar'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import type { EnhanceState } from '$lib/forms/enhance.svelte'
  import type { PageProps } from './$types'
  import { createBlock } from './page.remote'

  interface Props {
    area: NonNullable<ZeroQueryResult<PageProps['data']['query']>[0]['area']>
    name: string
  }

  let { area, name }: Props = $props()
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

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  {...createBlock.enhance(enhanceWithFile(state))}
  enctype="multipart/form-data"
>
  <BlockFormFields {name} areaFk={area.id} fileUploadProps={{ state }} />

  <FormActionBar label="Save block" pending={createBlock.pending} />
</form>
