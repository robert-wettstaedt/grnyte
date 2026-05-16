<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
  import DangerZone from '$lib/components/DangerZone'
  import FormAppBar from '$lib/components/FormActionBar/FormAppBar.svelte'
  import { pageState } from '$lib/components/Layout'
  import { getAreaContext } from '$lib/contexts/area'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import AreaFormFields from '../../../AreaFormFields'
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

<FormAppBar {form} title={t('areas.editArea')} subtitle="{t('common.in')} {area.name}" pending={updateArea.pending} />

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
