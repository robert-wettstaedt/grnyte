<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import FormFieldError from '$lib/components/FormFieldError'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import { getBlockContext } from '$lib/contexts/block'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getI18n } from '$lib/i18n'
  import { AppBar, Tabs } from '@skeletonlabs/skeleton-svelte'
  import type { Coordinate } from 'ol/coordinate'
  import type { ChangeEventHandler } from 'svelte/elements'
  import { deleteGeolocation, updateLocation } from './page.remote'

  const { block } = getBlockContext()
  const { t } = getI18n()

  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let tabSet = $state('map')

  $effect(() => {
    updateLocation.fields.set({
      blockId: String(block.id),
      lat: block.geolocation?.lat.toString(),
      long: block.geolocation?.long.toString(),
    })
  })

  const onChange = (value: Coordinate | string) => {
    if (typeof value === 'string') {
      return
    }

    updateLocation.fields.lat.set(String(value?.at(1)))
    updateLocation.fields.long.set(String(value?.at(0)))

    document.scrollingElement?.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'smooth' })
  }

  const getValue: ChangeEventHandler<HTMLInputElement> = (event): string => {
    return String((event.target as HTMLInputElement).value)
  }

  const onChangeLat: ChangeEventHandler<HTMLInputElement> = (event) => {
    updateLocation.fields.lat.set(getValue(event))
  }

  const onChangeLong: ChangeEventHandler<HTMLInputElement> = (event) => {
    updateLocation.fields.long.set(getValue(event))
  }
</script>

<svelte:head>
  <title>{t('location.editLocationOfTitle', { name: block.name })} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {t('location.editLocation')} <a class="anchor" href={basePath}>{block.name}</a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-4 p-2 md:mt-8 md:p-4" {...updateLocation.enhance(enhanceForm())}>
  <input type="hidden" {...updateLocation.fields.blockId.as('text')} />
  <input type="hidden" {...updateLocation.fields.lat.as('text')} />
  <input type="hidden" {...updateLocation.fields.long.as('text')} />

  <Tabs onValueChange={(event) => (tabSet = event.value ?? 'map')} value={tabSet}>
    <Tabs.List>
      <Tabs.Trigger value="map">{t('map.title')}</Tabs.Trigger>
      <Tabs.Trigger value="latlong">{t('map.latLong')}</Tabs.Trigger>
      <Tabs.Indicator />
    </Tabs.List>

    <Tabs.Content value="map">
      <FormFieldError issues={updateLocation.fields.lat.issues()} />
      <FormFieldError issues={updateLocation.fields.long.issues()} />

      <div use:fitHeightAction>
        {#await import('$lib/components/BlocksMapWithAddableMarker') then BlocksMap}
          <BlocksMap.default selectedArea={{ id: block.areaFk }} selectedBlock={block} {onChange} />
        {/await}
      </div>
    </Tabs.Content>

    <Tabs.Content value="latlong">
      <div class="flex flex-col gap-4">
        <label class="label">
          <span>{t('map.latitude')}</span>
          <input
            class="input"
            aria-errormessage={updateLocation.fields.lat.issues() ? 'location-form-fields-lat-error' : undefined}
            onchange={onChangeLat}
            value={updateLocation.fields.lat.value()}
          />

          <FormFieldError id="location-form-fields-lat-error" issues={updateLocation.fields.lat.issues()} />
        </label>

        <label class="label">
          <span>{t('map.longitude')}</span>
          <input
            class="input"
            aria-errormessage={updateLocation.fields.long.issues() ? 'location-form-fields-long-error' : undefined}
            onchange={onChangeLong}
            value={updateLocation.fields.long.value()}
          />

          <FormFieldError id="location-form-fields-long-error" issues={updateLocation.fields.long.issues()} />
        </label>
      </div>
    </Tabs.Content>
  </Tabs>

  <FormActionBar
    disabled={!updateLocation.fields.lat.value() || !updateLocation.fields.long.value()}
    label={t('location.updateLocation')}
    pending={updateLocation.pending}
  />
</form>

{#if block.geolocationFk != null && checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], block.regionFk)}
  <DangerZone
    name={t('location.location')}
    onDelete={() => (block.id == null ? undefined : deleteGeolocation(block.id))}
  />
{/if}
