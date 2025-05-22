<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import { invalidateCache } from '$lib/cache/cache'
  import AppBar from '$lib/components/AppBar'
  import { config } from '$lib/config'
  import { Popover, ProgressRing, Tabs } from '@skeletonlabs/skeleton-svelte'
  import type { Coordinate } from 'ol/coordinate'
  import type { ChangeEventHandler } from 'svelte/elements'

  let { data, form } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let loading = $state(false)

  let coordinate: Coordinate | null = $state(
    data.block.geolocation == null ? null : [data.block.geolocation.long, data.block.geolocation.lat],
  )
  let tabSet = $state('map')

  const onChange = (value: Coordinate | string) => {
    if (typeof value === 'string') {
      return
    }

    coordinate = value
    document.scrollingElement?.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'smooth' })
  }

  const getValue: ChangeEventHandler<HTMLInputElement> = (event): number => {
    return Number((event.target as HTMLInputElement).value)
  }

  const onChangeLat: ChangeEventHandler<HTMLInputElement> = (event) => {
    coordinate = [coordinate?.at(0), getValue(event)]
  }

  const onChangeLong: ChangeEventHandler<HTMLInputElement> = (event) => {
    coordinate = [getValue(event), coordinate?.at(1)]
  }
</script>

<svelte:head>
  <title>Edit geolocation of {data.block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit geolocation of</span>
    <a class="anchor" href={basePath}>{data.block.name}</a>
  {/snippet}
</AppBar>

<form
  class="card preset-filled-surface-100-900 mt-4 p-2 md:mt-8 md:p-4"
  action="?/updateLocation"
  method="POST"
  use:enhance={() => {
    loading = true

    return async ({ update }) => {
      loading = false
      await invalidateCache(config.cache.keys.layoutBlocks)
      await invalidateCache(config.cache.keys.layoutBlocksHash)

      return update()
    }
  }}
>
  <Tabs onValueChange={(event) => (tabSet = event.value ?? 'map')} value={tabSet}>
    {#snippet list()}
      <Tabs.Control value="map">Map</Tabs.Control>
      <Tabs.Control value="latlong">Lat Long</Tabs.Control>
    {/snippet}

    {#snippet content()}
      <Tabs.Panel value="map">
        <div use:fitHeightAction>
          {#await import('$lib/components/BlocksMapWithAddableMarker') then BlocksMap}
            <BlocksMap.default selectedArea={data.block.area} selectedBlock={data.block} {onChange} />
          {/await}
        </div>

        <input hidden name="lat" value={form?.lat ?? coordinate?.at(1)} />
        <input hidden name="long" value={form?.long ?? coordinate?.at(0)} />
      </Tabs.Panel>

      <Tabs.Panel value="latlong">
        <div class="flex flex-col gap-4">
          <label class="label">
            <span>Latitude</span>
            <input class="input" name="lat" onchange={onChangeLat} value={form?.lat ?? coordinate?.at(1) ?? ''} />
          </label>

          <label class="label">
            <span>Longitude</span>
            <input class="input" name="long" onchange={onChangeLong} value={form?.long ?? coordinate?.at(0) ?? ''} />
          </label>
        </div>
      </Tabs.Panel>
    {/snippet}
  </Tabs>

  <div class="mt-8 flex justify-between md:items-center">
    <div>
      <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>
    </div>

    <div class="flex flex-col-reverse gap-8 md:flex-row md:gap-4">
      {#if data.block.geolocationFk != null && checkRegionPermission(data.userRegions, [REGION_PERMISSION_DELETE], data.block.regionFk)}
        <Popover
          arrow
          arrowBackground="!bg-surface-200 dark:!bg-surface-800"
          contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
          positioning={{ placement: 'top' }}
          triggerBase="btn preset-filled-error-500 !text-white"
        >
          {#snippet trigger()}
            <i class="fa-solid fa-trash"></i>Delete geolocation
          {/snippet}

          {#snippet content()}
            <article>
              <p>Are you sure you want to delete the geolocation of this block?</p>
            </article>

            <footer class="flex justify-end">
              <form
                method="POST"
                action="?/removeGeolocation"
                use:enhance={() => {
                  loading = true

                  return async ({ update }) => {
                    loading = false
                    await invalidateCache(config.cache.keys.layoutBlocks)
                    await invalidateCache(config.cache.keys.layoutBlocksHash)

                    return update()
                  }
                }}
              >
                <button class="btn btn-sm preset-filled-error-500 !text-white" type="submit">Yes</button>
              </form>
            </footer>
          {/snippet}
        </Popover>
      {/if}

      <button class="btn preset-filled-primary-500" type="submit" disabled={loading || coordinate == null}>
        {#if loading}
          <span class="me-2">
            <ProgressRing size="size-4" value={null} />
          </span>
        {/if}

        Update geolocation
      </button>
    </div>
  </div>
</form>
