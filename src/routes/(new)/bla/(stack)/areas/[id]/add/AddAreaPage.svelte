<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { getAreaContext } from '$lib/contexts/area'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { createArea } from './page.remote'
  import AreaFormFields from '../AreaFormFields'

  interface Props {
    description: Partial<Row<'areas'>>['description']
    name: Partial<Row<'areas'>>['name']
    type: Partial<Row<'areas'>>['type']
  }

  let { description = $bindable(), name = $bindable(), type = $bindable() }: Props = $props()

  const { area } = getAreaContext()
  const { t } = getI18n()
</script>

<svelte:head>
  <title>
    {t('areas.createAreaInTitle', { name: area.name })} - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<form class="py-16" {...createArea.enhance(enhanceForm())}>
  <AppBar class="fixed top-0 z-10">
    <AppBar.Toolbar class="grid-cols-[auto_1fr_auto]">
      <AppBar.Lead>
        <button type="button" class="btn-icon" onclick={() => history.back()} title={t('common.back')}>
          <i class="fa-solid fa-arrow-left"></i>
        </button>
      </AppBar.Lead>

      <AppBar.Headline class="flex-col">
        <span class="leading-none">
          {t('areas.createArea')}
        </span>

        <span class="text-surface-500 text-xs leading-none">
          {t('common.in')}
          {area.name}
        </span>
      </AppBar.Headline>

      <AppBar.Trail>
        <button class="btn-icon preset-filled-primary-500" title={t('common.save')} type="submit">
          {#if createArea.pending > 0}
            <LoadingIndicator />
          {:else}
            <i class="fa-solid fa-floppy-disk"></i>
          {/if}
        </button>
      </AppBar.Trail>
    </AppBar.Toolbar>
  </AppBar>

  <AreaFormFields bind:description bind:name bind:type parentFk={area?.id} regionFk={area?.regionFk} />
</form>
