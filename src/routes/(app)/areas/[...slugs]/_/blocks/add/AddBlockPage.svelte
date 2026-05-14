<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import BlockFormFields from '$lib/components/BlockFormFields'
  import FormActionBar from '$lib/components/FormActionBar'
  import { getAreaContext } from '$lib/contexts/area'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm, type EnhanceState } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { createBlock } from './page.remote'

  interface Props {
    name: Row<'blocks'>['name']
  }

  let { name = $bindable() }: Props = $props()
  const { area } = getAreaContext()
  let basePath = $derived(`/areas/${page.params.slugs}`)
  let state = $state<EnhanceState>({})
  const { t } = getI18n()
</script>

<svelte:head>
  <title>{t('blocks.createBlockInTitle', { name: area.name })} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {@html t('blocks.createBlockIn', { name: area.name, url: basePath })}
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createBlock.enhance(enhanceForm(state))}>
  <BlockFormFields bind:name areaFk={area.id} fileUploadProps={{ state }} />

  <FormActionBar {state} label={t('blocks.saveBlock')} pending={state.loading ? 1 : createBlock.pending} />
</form>
