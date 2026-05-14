<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import FormActionBar from '$lib/components/FormActionBar'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { createArea } from './page.remote'

  const { t } = getI18n()
</script>

<svelte:head>
  <title>{t('areas.createArea')} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>{t('areas.createArea')}</AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createArea.enhance(enhanceForm())}>
  <AreaFormFields fields={createArea.fields} />

  <FormActionBar label={t('areas.saveArea')} pending={createArea.pending} />
</form>
