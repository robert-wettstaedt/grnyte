<script lang="ts">
  import { deleteParking, restoreParking } from '$lib/entities/area/areas.remote'
  import { canDeleteParking } from '$lib/entities/area/permissions'
  import type { ParkingDetail } from '$lib/entities/geolocation/dto'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { withUndo } from '$lib/state/toast'
  import DirectionsButton from '../../Sheet/DirectionsButton.svelte'
  import MenuRow from '../../Sheet/MenuRow.svelte'
  import MoreMenu from '../../Sheet/MoreMenu.svelte'
  import ShareButton from '../../Sheet/ShareButton.svelte'

  interface Props {
    parking: ParkingDetail
  }

  const { parking }: Props = $props()
  const global = getGlobalState()

  const destination = $derived({ lat: parking.lat, long: parking.long })
  const canDelete = $derived(canDeleteParking(global.userRegions, parking))

  const onDelete = () =>
    withUndo(deleteParking({ id: parking.id }), { message: m.parking_deleted(), onUndo: restoreParking })
</script>

<div class="flex gap-2">
  <DirectionsButton {destination} />

  <ShareButton text={parking.area?.name ?? m.parking_title()} />

  {#if canDelete}
    <MoreMenu title={m.parking_title()}>
      {#snippet children(close)}
        <h3 class="text-surface-500 px-1 pt-1 pb-1 text-xs font-bold tracking-wider uppercase">{m.area_manage()}</h3>

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
</div>
