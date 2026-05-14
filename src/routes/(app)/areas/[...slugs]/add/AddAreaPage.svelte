<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import FormActionBar from '$lib/components/FormActionBar'
  import Trans from '$lib/components/Trans'
  import { getAreaContext } from '$lib/contexts/area'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { createArea } from './../../add/page.remote'

  const { area } = getAreaContext()
  let basePath = $derived(`/areas/${page.params.slugs}`)
  const { t } = getI18n()
</script>

<svelte:head>
  {#if area == null}
    <title>{t('areas.createArea')} - {PUBLIC_APPLICATION_NAME}</title>
  {:else}
    <title>{t('areas.createAreaInTitle', { name: area.name })} - {PUBLIC_APPLICATION_NAME}</title>
  {/if}
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {#if area == null}
        {t('areas.createArea')}
      {:else}
        <Trans key="areas.createAreaIn" values={{ url: basePath, name: area.name }} />
      {/if}
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createArea.enhance(enhanceForm())}>
  <AreaFormFields defaultValue={{ parentFk: area?.id, regionFk: area?.regionFk }} fields={createArea.fields} />

  <FormActionBar label={t('areas.saveArea')} pending={createArea.pending} />
</form>
