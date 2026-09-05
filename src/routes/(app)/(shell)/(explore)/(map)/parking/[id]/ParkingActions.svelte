<script lang="ts">
  import ActionBar from '$lib/components/ActionBar/ActionBar.svelte'
  import DirectionsButton from '$lib/components/DirectionsButton/DirectionsButton.svelte'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import MoreMenu from '$lib/components/MoreMenu/MoreMenu.svelte'
  import ShareButton from '$lib/components/ShareButton/ShareButton.svelte'
  import { deleteParking, restoreParking } from '$lib/entities/area/areas.remote'
  import { canDeleteParking } from '$lib/entities/area/permissions'
  import type { ParkingDetail } from '$lib/entities/geolocation/dto'
  import type { LocationState } from '$lib/entities/geolocation/location.svelte'
  import LocationMeta from '$lib/entities/geolocation/LocationMeta.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { withUndo } from '$lib/state/toast'

  /** Directions keeps the labelled slot here and nowhere else: it is all a parking pin is for. */
  interface Props {
    location: LocationState
    parking: ParkingDetail
  }

  const { location, parking }: Props = $props()
  const global = getGlobalState()

  const destination = $derived({ lat: parking.lat, long: parking.long })
  const canDelete = $derived(canDeleteParking(global.userRegions, parking))

  const onDelete = () =>
    withUndo(deleteParking({ id: parking.id }), { message: m.parking_deleted(), onUndo: restoreParking })
</script>

<div class="space-y-2">
  <LocationMeta distance={location.distance} isHere={location.isHere} pin="set" />

  <ActionBar>
    {#snippet cta()}
      <DirectionsButton {destination} variant="cta" />
    {/snippet}

    <ShareButton text={parking.area?.name ?? m.parking_title()} />

    {#if canDelete}
      <MoreMenu title={m.parking_title()}>
        {#snippet children(close)}
          <h3 class="text-surface-500 px-1 pt-1 pb-1 text-xs font-bold tracking-wider uppercase">{m.areas_manage()}</h3>

          <MenuRow
            destructive
            icon="map-pin-x"
            label={m.parking_delete()}
            onclick={() => {
              close()
              onDelete()
            }}
          />
        {/snippet}
      </MoreMenu>
    {/if}
  </ActionBar>
</div>
