<script>
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import FormActionBar from '$lib/components/FormActionBar'
  import RegionFormFields from '$lib/components/RegionFormFields'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { createRegion } from './page.remote'

  let isValid = $state(false)

  const { t } = $derived(getI18n())
</script>

<svelte:head>
  <title>{t('settings.regionSettings.createRegion')} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>{t('settings.regionSettings.createRegion')}</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createRegion.enhance(enhanceForm())}>
  <RegionFormFields name={''} onChange={(valid) => (isValid = valid)} settings={{ mapLayers: [] }} />

  <FormActionBar disabled={!isValid} label={t('settings.regionSettings.saveRegion')} pending={createRegion.pending} />
</form>
