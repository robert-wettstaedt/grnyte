<script>
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FormActionBar from '$lib/components/FormActionBar/FormActionBar.svelte'
  import RegionFormFields from '$lib/components/RegionFormFields'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { updateRegion } from './page.remote'

  let { data } = $props()

  $effect(() => {
    updateRegion.fields.set({
      name: data.region.name,
      regionId: String(data.region.id),
      settings: data.region.settings == null ? undefined : JSON.stringify(data.region.settings),
    })
  })

  const { t } = getI18n()
  let isValid = $state(false)
</script>

<svelte:head>
  <title>{t('settings.regionSettings.editRegion')} {data.region.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>{t('settings.regionSettings.editRegion')} {data.region.name}</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...updateRegion.enhance(enhanceForm())}>
  <input type="hidden" {...updateRegion.fields.regionId.as('text')} />

  <RegionFormFields fields={updateRegion.fields} onChange={(valid) => (isValid = valid)} />

  <FormActionBar disabled={!isValid} label={t('settings.regionSettings.saveRegion')} pending={updateRegion.pending} />
</form>
