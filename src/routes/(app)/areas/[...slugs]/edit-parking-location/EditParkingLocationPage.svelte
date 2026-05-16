<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import { getAreaContext } from '$lib/contexts/area'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar, Tabs } from '@skeletonlabs/skeleton-svelte'
  import type { ChangeEventHandler } from 'svelte/elements'
  import { deleteParkingLocation, updateParkingLocation } from './page.remote'
  import FormFieldError from '$lib/components/FormFieldError'

  const { area } = getAreaContext()
  const { t } = getI18n()

  let basePath = $derived(`/areas/${page.params.slugs}`)
  let tabSet = $state('map')

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

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {t('parking.editLocation')}
      <a class="anchor" href={basePath}>{area.name}</a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...updateParkingLocation.enhance(enhanceForm())}>
  <input type="hidden" {...updateParkingLocation.fields.areaId.as('text')} />
  <input type="hidden" {...updateParkingLocation.fields.lat.as('text')} />
  <input type="hidden" {...updateParkingLocation.fields.long.as('text')} />
  <input type="hidden" {...updateParkingLocation.fields.polyline.as('text')} />

  <FormFieldError issues={updateParkingLocation.fields.polyline.issues()} />

  <Tabs onValueChange={(event) => (tabSet = event.value ?? 'map')} value={tabSet}>
    <Tabs.List>
      <Tabs.Trigger value="map">{t('map.title')}</Tabs.Trigger>
      <Tabs.Trigger value="latlong">{t('map.latLong')}</Tabs.Trigger>
      <Tabs.Indicator />
    </Tabs.List>

    <Tabs.Content value="map">
      <FormFieldError issues={updateParkingLocation.fields.lat.issues()} />
      <FormFieldError issues={updateParkingLocation.fields.long.issues()} />

      <div use:fitHeightAction>
        {#await import('$lib/components/BlocksMapWithAddableMarker') then BlocksMap}
          <BlocksMap.default
            modes={[
              { icon: 'fa-solid fa-parking', value: 'click' },
              { icon: 'fa-solid fa-draw-polygon', value: 'draw' },
            ]}
            onChange={(value) => {
              if (typeof value === 'string') {
                updateParkingLocation.fields.polyline.set(value)
              } else {
                updateParkingLocation.fields.lat.set(String(value.at(1)))
                updateParkingLocation.fields.long.set(String(value.at(0)))
              }
            }}
            selectedArea={area}
          />
        {/await}
      </div>
    </Tabs.Content>

    <Tabs.Content value="latlong">
      <div class="flex flex-col gap-4">
        <label class="label">
          <span>{t('map.latitude')}</span>
          <input
            class="input"
            aria-errormessage={updateParkingLocation.fields.lat.issues() ? 'parking-form-fields-lat-error' : undefined}
            onchange={onChangeLat}
            value={updateParkingLocation.fields.lat.value()}
          />

          <FormFieldError id="parking-form-fields-lat-error" issues={updateParkingLocation.fields.lat.issues()} />
        </label>

        <label class="label">
          <span>{t('map.longitude')}</span>
          <input
            class="input"
            aria-errormessage={updateParkingLocation.fields.long.issues()
              ? 'parking-form-fields-long-error'
              : undefined}
            onchange={onChangeLong}
            value={updateParkingLocation.fields.long.value()}
          />

          <FormFieldError id="parking-form-fields-long-error" issues={updateParkingLocation.fields.long.issues()} />
        </label>
      </div>
    </Tabs.Content>
  </Tabs>

  <FormActionBar label={t('parking.updateLocation')} pending={updateParkingLocation.pending} />
</form>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], area.regionFk)}
  <DangerZone
    name={t('parking.location')}
    onDelete={() => (area.id == null ? undefined : deleteParkingLocation(area.id))}
  />
{/if}
