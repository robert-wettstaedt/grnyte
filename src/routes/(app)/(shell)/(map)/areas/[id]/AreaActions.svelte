<script lang="ts">
  import { resolve } from '$app/paths'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { deleteArea, restoreArea } from '$lib/entities/area/areas.remote'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { canAddArea, canAddBlock, canAddParking, canDeleteArea, canEditArea } from '$lib/entities/area/permissions'
  import { waitForArea } from '$lib/entities/area/resources.svelte'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { withUndo } from '$lib/state/toast'
  import DirectionsButton from '../../Sheet/DirectionsButton.svelte'
  import MenuRow from '../../Sheet/MenuRow.svelte'
  import MoreMenu from '../../Sheet/MoreMenu.svelte'
  import SaveButton from '../../Sheet/SaveButton.svelte'
  import ShareButton from '../../Sheet/ShareButton.svelte'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()
  const global = getGlobalState()

  const canEdit = $derived(canEditArea(global.userRegions, area))
  const canDelete = $derived(canDeleteArea(global.userRegions, area))
  const canAdmin = $derived(checkRegionPermission(global.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk))
  const canAddAreaHere = $derived(canAddArea(global.userRegions, area))
  const canAddBlockHere = $derived(canAddBlock(global.userRegions, area))
  const canAddParkingHere = $derived(canAddParking(global.userRegions, area))

  // Which sheet sections have at least one available action.
  const showAdd = $derived(canAddAreaHere || canAddBlockHere || canAddParkingHere)
  const showManage = $derived(canEdit || canAdmin)

  // Drive to the parking lot — the address you actually drive to — or fall back to
  // the mean of the blocks anywhere beneath this area (a name search would just send
  // people to the wrong place).
  const blocks = blockList(() => ({ areaId: area.id }))
  const destination = $derived.by(() => {
    const parking = area.parkingLocations.at(0)
    if (parking != null) return parking
    const coords = blocks.data.map((block) => block.geolocation).filter((geo) => geo != null)
    if (coords.length === 0) return undefined
    return {
      lat: coords.reduce((sum, geo) => sum + geo.lat, 0) / coords.length,
      long: coords.reduce((sum, geo) => sum + geo.long, 0) / coords.length,
    }
  })

  const onDelete = () =>
    withUndo(deleteArea({ id: area.id }), {
      message: m.area_deleted(),
      onUndo: restoreArea,
      waitFor: (data) => waitForArea(data.areaId),
    })
</script>

<div class="flex gap-2">
  {#if destination == null}
    <div class="btn preset-tonal-warning btn-lg flex-1 cursor-default text-sm">
      <Icon name="alert-triangle" size={16} />
      {m.blocks_noLocation()}
    </div>
  {:else}
    <DirectionsButton {destination} />
  {/if}

  <SaveButton entityId={String(area.id)} entityType="area" regionFk={area.regionFk} />

  <ShareButton text={area.name} />

  <MoreMenu title={area.name}>
    {#snippet children(close)}
      {#if showAdd}
        <h3 class="text-surface-500 px-1 pt-1 pb-1 text-xs font-bold tracking-wider uppercase">{m.common_add()}</h3>

        {#if canAddAreaHere}
          <MenuRow
            accent
            href={resolve('/(app)/areas/[id]/add', { id: String(area.id) })}
            icon="area"
            label={m.areas_addArea()}
            onclick={close}
          />
        {/if}

        {#if canAddBlockHere}
          <MenuRow
            accent
            href={resolve('/(app)/areas/[id]/blocks/add', { id: String(area.id) })}
            icon="block"
            label={m.blocks_addBlock()}
            onclick={close}
          />
        {/if}

        {#if canAddParkingHere}
          <MenuRow
            accent
            href={resolve('/(app)/areas/[id]/parking/edit', { id: String(area.id) })}
            icon="parking"
            label={m.areas_addParkingLocation()}
            onclick={close}
          />
        {/if}
      {/if}

      {#if showManage}
        <h3 class="text-surface-500 px-1 pt-4 pb-1 text-xs font-bold tracking-wider uppercase">{m.area_manage()}</h3>

        {#if canEdit}
          <MenuRow
            href={resolve('/(app)/areas/[id]/edit', { id: String(area.id) })}
            icon="edit"
            label={m.common_edit()}
            onclick={close}
          />
        {/if}

        {#if canEdit && blocks.data.length > 1}
          <MenuRow
            href={resolve('/(app)/areas/[id]/blocks/order', { id: String(area.id) })}
            icon="grip-vertical"
            label={m.blocks_order_title()}
            onclick={close}
          />
        {/if}

        {#if canAdmin}
          <MenuRow
            href={resolve('/(app)/areas/[id]/export', { id: String(area.id) })}
            icon="file-text"
            label={m.export_pdf()}
            onclick={close}
          />
        {/if}

        {#if canAdmin}
          <MenuRow
            href={resolve('/(app)/areas/[id]/sync-external-resources', { id: String(area.id) })}
            icon="sync"
            label={m.sync_externalResources()}
            onclick={close}
          />
        {/if}

        {#if canDelete}
          <MenuRow
            destructive
            icon="map-pin-x"
            label={m.area_delete()}
            onclick={() => {
              close()
              onDelete()
            }}
          />
        {/if}
      {/if}
    {/snippet}
  </MoreMenu>
</div>
