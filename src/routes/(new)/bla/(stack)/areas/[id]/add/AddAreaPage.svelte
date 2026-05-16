<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { getAreaContext } from '$lib/contexts/area'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import AreaFormFields from '../AreaFormFields'
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

<AppBar
  class="preset-filled-surface-100-900 md:border-surface-50-950 fixed top-0 z-10 rounded-b-xl md:right-0 md:left-25 md:w-auto md:border-l-2"
>
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
      <button class="btn-icon preset-filled-primary-500" onclick={() => form?.requestSubmit()} title={t('common.save')}>
        {#if createArea.pending > 0}
          <LoadingIndicator />
        {:else}
          <i class="fa-solid fa-floppy-disk"></i>
        {/if}
      </button>
    </AppBar.Trail>
  </AppBar.Toolbar>
</AppBar>

<div class="m-auto flex flex-col items-center py-16 md:max-w-xl">
  <form bind:this={form} class="w-full" {...createArea.enhance(enhanceForm())}>
    <AreaFormFields fields={createArea.fields} />
  </form>
</div>
