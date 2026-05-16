<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FormAppBar from '$lib/components/FormActionBar/FormAppBar.svelte'
  import { getAreaContext } from '$lib/contexts/area'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import AreaFormFields from '../../../AreaFormFields'
  import { createArea } from './page.remote'

  const { area } = getAreaContext()
  const { t } = getI18n()
  let form = $state<HTMLFormElement>()

  $effect(() => {
    createArea.fields.set({
      parentFk: String(area.id),
      regionFk: String(area.regionFk),
    })
  })
</script>

<svelte:head>
  <title>
    {t('areas.createAreaInTitle', { name: area.name })} - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<FormAppBar {form} title={t('areas.createArea')} subtitle="{t('common.in')} {area.name}" pending={createArea.pending} />

<div class="m-auto flex flex-col items-center py-16 md:max-w-xl">
  <form bind:this={form} class="w-full" {...createArea.enhance(enhanceForm())}>
    <AreaFormFields fields={createArea.fields} />
  </form>
</div>
