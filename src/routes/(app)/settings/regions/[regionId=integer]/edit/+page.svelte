<script>
  import { enhance } from '$app/forms'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import RegionFormFields from '$lib/components/RegionFormFields'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'

  let { data, form } = $props()

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

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" method="POST" use:enhance>
  <RegionFormFields
    name={form?.name ?? data.region.name}
    onChange={(valid) => (isValid = valid)}
    settings={form?.settings ?? data.region.settings}
  />

  <div class="mt-8 flex justify-between md:items-center">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button"
      >{t('common.cancel')}</button
    >
    <button class="btn preset-filled-primary-500" disabled={!isValid} type="submit">
      <i class="fa-solid fa-floppy-disk"></i>
      {t('settings.regionSettings.saveRegion')}
    </button>
  </div>
</form>
