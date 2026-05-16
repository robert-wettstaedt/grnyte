<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
  import DangerZone from '$lib/components/DangerZone'
  import { pageState } from '$lib/components/Layout'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { getAreaContext } from '$lib/contexts/area'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import AreaFormFields from '../AreaFormFields'
  import { deleteArea, updateArea } from './page.remote'

  const { area } = getAreaContext()
  const { t } = getI18n()
  let form = $state<HTMLFormElement>()

  $effect(() => {
    updateArea.fields.set({
      description: area.description ?? undefined,
      id: String(area.id),
      name: area.name,
      parentFk: area.parentFk?.toString(),
      regionFk: String(area.regionFk),
      type: area.type ?? undefined,
    })
  })
</script>

<svelte:head>
  <title>
    {t('areas.editAreaOfTitle', { name: area.name })} - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar
  class="preset-filled-surface-100-900 md:border-surface-50-950 fixed top-0 z-10 rounded-b-xl md:right-0 md:left-25 md:w-auto md:border-l-2"
>
  <AppBar.Toolbar class="grid-cols-[auto_1fr_auto]">
    <AppBar.Lead>
      <button class="btn-icon" onclick={() => history.back()} title={t('common.back')} type="button">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
    </AppBar.Lead>

    <AppBar.Headline class="flex-col">
      <span class="leading-none">
        {t('areas.editArea')}
      </span>

      <span class="text-surface-500 text-xs leading-none">
        {t('common.in')}
        {area.name}
      </span>
    </AppBar.Headline>

    <AppBar.Trail>
      <button class="btn-icon preset-filled-primary-500" onclick={() => form?.requestSubmit()} title={t('common.save')}>
        {#if updateArea.pending > 0}
          <LoadingIndicator />
        {:else}
          <i class="fa-solid fa-floppy-disk"></i>
        {/if}
      </button>
    </AppBar.Trail>
  </AppBar.Toolbar>
</AppBar>

<div class="m-auto flex flex-col items-center py-16 md:max-w-xl">
  <form bind:this={form} class="w-full" {...updateArea.enhance(enhanceForm())}>
    <AreaFormFields fields={updateArea.fields} />
  </form>

  {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], area.regionFk) || (checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk) && area.createdBy === pageState.user?.id)}
    <div class="w-full px-3 md:px-0">
      <DangerZone name={t('entities.area')} onDelete={() => (area.id == null ? undefined : deleteArea(area.id))} />
    </div>
  {/if}
</div>
