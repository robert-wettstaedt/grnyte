<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import FormActionBar from '$lib/components/FormActionBar'
  import { getAreaContext } from '$lib/contexts/area'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { getI18n } from '$lib/i18n'
  import { createArea } from './../../add/page.remote'

  interface Props {
    description: Partial<Row<'areas'>>['description']
    name: Partial<Row<'areas'>>['name']
    type: Partial<Row<'areas'>>['type']
  }

  let { description = $bindable(), name = $bindable(), type = $bindable() }: Props = $props()

  const { area } = getAreaContext()
  let basePath = $derived(`/areas/${page.params.slugs}`)
  const { t } = $derived(getI18n())
</script>

<svelte:head>
  {#if area == null}
    <title>{t('areas.createAreaTitle')} - {PUBLIC_APPLICATION_NAME}</title>
  {:else}
    <title>{t('areas.createAreaInTitle', { name: area.name })} - {PUBLIC_APPLICATION_NAME}</title>
  {/if}
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {t('areas.createArea')}
      {#if area != null}
        {t('common.in')}
        <a class="anchor" href={basePath}>{area.name}</a>
      {/if}
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...createArea.enhance(enhanceForm())}>
  <AreaFormFields bind:description bind:name bind:type parentFk={area?.id} regionFk={area?.regionFk} />

  <FormActionBar label={t('areas.saveArea')} pending={createArea.pending} />
</form>
