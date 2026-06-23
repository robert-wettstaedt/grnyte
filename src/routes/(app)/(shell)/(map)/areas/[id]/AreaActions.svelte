<script lang="ts">
  import { resolve } from '$app/paths'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { canAddArea, canAddBlock, canAddParking, canEditArea } from '$lib/entities/area/permissions'
  import { createBlock } from '$lib/entities/block/blocks.remote'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import DirectionsButton from '../../Sheet/DirectionsButton.svelte'
  import MenuRow from '../../Sheet/MenuRow.svelte'
  import MoreMenu from '../../Sheet/MoreMenu.svelte'
  import ShareButton from '../../Sheet/ShareButton.svelte'
  import SaveButton from './SaveButton.svelte'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()
  const global = getGlobalState()

  let addBlockOpen = $state(false)

  const canEdit = $derived(canEditArea(global.userRegions, area))
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
</script>

<div class="flex gap-2">
  <DirectionsButton {destination} />

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
            icon="block"
            label={m.blocks_addBlock()}
            onclick={() => {
              close()
              addBlockOpen = true
            }}
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
      {/if}
    {/snippet}
  </MoreMenu>
</div>

{#if canAddBlockHere}
  <Dialog
    open={addBlockOpen}
    onOpenChange={(event) => (addBlockOpen = event.open)}
    onsave={async () => {
      await createBlock({ areaId: area.id })
    }}
    pending={createBlock.pending}
    saveText={m.common_ok()}
    title={m.blocks_createBlockInTitle({ name: area.name })}
  >
    {#snippet content()}
      {m.blocks_createBlockConfirmation()}
    {/snippet}
  </Dialog>
{/if}
