<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FormAppBar from '$lib/components/FormActionBar/FormAppBar.svelte'
  import { getAreaContext } from '$lib/contexts/area'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm, type EnhanceState } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import BlockFormFields from '../../../../BlockFormFields'
  import { createBlock } from './page.remote'

  interface Props {
    name: Row<'blocks'>['name']
  }

  let { name }: Props = $props()
  const { area } = getAreaContext()
  const { t } = getI18n()
  let enhancedState = $state<EnhanceState>({})
  let form = $state<HTMLFormElement>()

  $effect(() => {
    createBlock.fields.set({
      areaId: String(area.id),
      name,
    })
  })
</script>

<svelte:head>
  <title>
    {t('blocks.createBlockInTitle', { name: area.name })} - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<FormAppBar
  {form}
  title={t('blocks.createBlock')}
  subtitle="{t('common.in')} {area.name}"
  pending={createBlock.pending}
  state={enhancedState}
/>

<div class="m-auto flex flex-col items-center py-16 md:max-w-xl">
  <form bind:this={form} class="w-full" {...createBlock.enhance(enhanceForm(enhancedState))}>
    <BlockFormFields fields={createBlock.fields} fileUploadProps={{ state: enhancedState }} />
  </form>
</div>
