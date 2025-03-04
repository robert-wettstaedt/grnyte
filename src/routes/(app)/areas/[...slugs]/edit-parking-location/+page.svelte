<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { DELETE_PERMISSION } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import { Popover, Tabs } from '@skeletonlabs/skeleton-svelte'
  import type { Coordinate } from 'ol/coordinate'
  import type { ChangeEventHandler } from 'svelte/elements'

  let { data, form } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)

  let coordinate: Coordinate | null = $state(null)
  let tabSet = $state('map')

  const onChange = ({ detail }: CustomEvent<Coordinate>) => (coordinate = detail)

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
  <title>Edit parking location of {data.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit parking location of</span>
    <a class="anchor" href={basePath}>{data.name}</a>
  {/snippet}
</AppBar>

<form
  class="card mt-8 p-2 md:p-4 preset-filled-surface-100-900"
  action="?/updateParkingLocation"
  method="POST"
  use:enhance
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
            <BlocksMap.default blocks={data.blocks} on:change={onChange} />
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

  <div class="flex justify-between mt-8">
    <button class="btn preset-outlined-primary-500" onclick={() => history.back()} type="button">Cancel</button>

    <div class="flex flex-col-reverse gap-8 md:flex-row md:gap-4">
      {#if data.userPermissions?.includes(DELETE_PERMISSION)}
        <Popover
          arrow
          arrowBackground="!bg-surface-200 dark:!bg-surface-800"
          contentBase="card bg-surface-200-800 p-4 space-y-4 max-w-[320px]"
          positioning={{ placement: 'top' }}
          triggerBase="btn preset-filled-error-500 !text-white"
        >
          {#snippet trigger()}
            <i class="fa-solid fa-trash"></i>Delete parking location
          {/snippet}

          {#snippet content()}
            <article>
              <p>Are you sure you want to delete this parking location?</p>
            </article>

            <footer class="flex justify-end">
              <form method="POST" action="?/removeParkingLocation" use:enhance>
                <button class="btn btn-sm preset-filled-error-500 !text-white" type="submit">Yes</button>
              </form>
            </footer>
          {/snippet}
        </Popover>
      {/if}

      <button class="btn preset-filled-primary-500" disabled={coordinate == null} type="submit">
        Update parking location
      </button>
    </div>
  </div>
</form>
