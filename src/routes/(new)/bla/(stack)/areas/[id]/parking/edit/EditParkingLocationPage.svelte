<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import DangerZone from '$lib/components/DangerZone'
  import FormAppBar from '$lib/components/AppBar/FormAppBar.svelte'
  import FormFieldError from '$lib/components/FormFieldError'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import { getAreaContext } from '$lib/contexts/area'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import type { ChangeEventHandler } from 'svelte/elements'
  import { deleteParkingLocation, updateParkingLocation } from './page.remote'

  const { area } = getAreaContext()
  const { t } = getI18n()
  let form = $state<HTMLFormElement>()

  $effect(() => {
    updateParkingLocation.fields.areaId.set(String(area.id))
  })

  const getValue: ChangeEventHandler<HTMLInputElement> = (event): string => {
    return String((event.target as HTMLInputElement).value)
  }

  const onChangeLat: ChangeEventHandler<HTMLInputElement> = (event) => {
    updateParkingLocation.fields.lat.set(getValue(event))
  }

  const onChangeLong: ChangeEventHandler<HTMLInputElement> = (event) => {
    updateParkingLocation.fields.long.set(getValue(event))
  }
</script>

<svelte:head>
  <title>{t('parking.editLocationOfTitle', { name: area.name })} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<FormAppBar
  {form}
  title={t('parking.editLocation')}
  subtitle="{t('common.in')} {area.name}"
  pending={updateParkingLocation.pending}
/>

<div class="m-auto flex flex-col items-center py-16 md:max-w-xl">
  <form bind:this={form} class="w-full" {...updateParkingLocation.enhance(enhanceForm())}>
    <input type="hidden" {...updateParkingLocation.fields.areaId.as('text')} />
    <input type="hidden" {...updateParkingLocation.fields.lat.as('text')} />
    <input type="hidden" {...updateParkingLocation.fields.long.as('text')} />
    <input type="hidden" {...updateParkingLocation.fields.polyline.as('text')} />

    <!-- TODO -->

    <FormFieldError issues={updateParkingLocation.fields.polyline.issues()} />
  </form>

  {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], area.regionFk)}
    <DangerZone
      name={t('parking.location')}
      onDelete={() => (area.id == null ? undefined : deleteParkingLocation(area.id))}
    />
  {/if}
</div>
