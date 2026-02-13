<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import FormActionBar from '$lib/components/FormActionBar'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import type { Snapshot } from './$types'
  import { createArea } from './page.remote'

  let description: Partial<Row<'areas'>>['description'] = $state()
  let name: Partial<Row<'areas'>>['name'] = $state()
  let regionFk: Partial<Row<'areas'>>['regionFk'] = $state()

  const { t } = getI18n()

  export const snapshot: Snapshot<Partial<Row<'areas'>>> = {
    capture: () => ({ description, name, regionFk }),
    restore: (snapshot) => {
      description = snapshot.description
      name = snapshot.name
      regionFk = snapshot.regionFk
    },
  }
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
  <AreaFormFields parentFk={undefined} bind:description bind:name bind:regionFk />

  <FormActionBar label={t('areas.saveArea')} pending={createArea.pending} />
</form>
