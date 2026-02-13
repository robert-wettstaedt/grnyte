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
  import { getI18n } from '$lib/i18n'
  import { createBlock } from './page.remote'

  interface Props {
    name: Row<'blocks'>['name']
  }

  let { name = $bindable() }: Props = $props()
  const { area } = getAreaContext()
  let basePath = $derived(`/areas/${page.params.slugs}`)
  let state = $state<EnhanceState>({})
  const { t } = $derived(getI18n())
</script>

<svelte:head>
  <title>{t('blocks.createBlockInTitle', { name: area.name })} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {t('blocks.createBlockIn', { name: area.name, url: basePath })}
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  {...createBlock.enhance(enhanceWithFile(state))}
  enctype="multipart/form-data"
>
  <BlockFormFields bind:name areaFk={area.id} fileUploadProps={{ state }} />

  <FormActionBar label={t('blocks.saveBlock')} pending={createBlock.pending} />
</form>
