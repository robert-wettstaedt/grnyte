<script lang="ts">
  import { resolve } from '$app/paths'
  import ActionBar, { ACTION_TOOL, ACTION_TOOL_LABEL } from '$lib/components/ActionBar/ActionBar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import MoreMenu from '$lib/components/MoreMenu/MoreMenu.svelte'
  import { deleteBlock, restoreBlock } from '$lib/entities/block/blocks.remote'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { canDeleteBlock, canEditBlock } from '$lib/entities/block/permissions'
  import { blockPin, blockRepairHref } from '$lib/entities/block/pin'
  import { waitForBlock } from '$lib/entities/block/resources.svelte'
  import type { SaveState } from '$lib/entities/favorite/save.svelte'
  import type { LocationState } from '$lib/entities/geolocation/location.svelte'
  import LocationMeta from '$lib/entities/geolocation/LocationMeta.svelte'
  import { canAddRoute } from '$lib/entities/route/permissions'
  import { canEditTopo } from '$lib/entities/topo/permissions'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { withUndo } from '$lib/state/toast'
  import EntityTools from '../../EntityTools.svelte'

  interface Props {
    block: BlockDetail
    location: LocationState
    /** Routes on this block: with none, `BlockEmpty` already offers the add. */
    routeCount: number
    save: SaveState
  }

  const { block, location, routeCount, save }: Props = $props()
  const global = getGlobalState()

  const canEdit = $derived(canEditBlock(global.userRegions, block))
  const canDelete = $derived(canDeleteBlock(global.userRegions, global.user?.id, block))
  const canAddRouteHere = $derived(canAddRoute(global.userRegions, block))
  const canEditTopos = $derived(canEditTopo(global.userRegions, block))

  // Drive straight to the block's own pin, when it has one.
  const destination = $derived(
    block.geolocation == null ? undefined : { lat: block.geolocation.lat, long: block.geolocation.long },
  )

  const editHref = $derived(resolve('/(app)/blocks/[id]/edit', { id: String(block.id) }))
  const moveHref = $derived(resolve('/(app)/blocks/[id]/move', { id: String(block.id) }))

  const pin = $derived(blockPin(block))
  const repairHref = $derived(blockRepairHref(block, canEdit))

  const onDelete = () =>
    withUndo(deleteBlock({ id: block.id }), {
      message: m.blocks_deleted(),
      onUndo: restoreBlock,
      waitFor: (data) => waitForBlock(data.blockId),
    })
</script>

<div>
  <LocationMeta distance={location.distance} href={repairHref} isHere={location.isHere} {pin} />

  <ActionBar>
    <!-- A square, not the labelled `cta` slot: six actions only clear a 360px row as squares. -->
    {#if canAddRouteHere && routeCount > 0}
      <a
        class={[ACTION_TOOL, 'preset-tonal-primary']}
        href={resolve('/(app)/blocks/[id]/routes/add', { id: String(block.id) })}
      >
        <Icon name="plus" size={19} />
        <span class={ACTION_TOOL_LABEL}>{m.common_route()}</span>
      </a>
    {/if}

    <EntityTools {destination} {save} shareText={block.name} />

    {#if canEdit || canDelete || canAddRouteHere || canEditTopos}
      <MoreMenu title={block.name}>
        {#snippet children(close)}
          <h3 class="text-surface-500 px-1 pt-1 pb-1 text-xs font-bold tracking-wider uppercase">{m.areas_manage()}</h3>

          {#if canAddRouteHere}
            <MenuRow
              href={resolve('/(app)/blocks/[id]/routes/add', { id: String(block.id) })}
              icon="route"
              label={m.routes_addRoute()}
              onclick={close}
            />
          {/if}

          {#if canEditTopos}
            <MenuRow
              href={resolve('/(app)/blocks/[id]/topos/edit', { id: String(block.id) })}
              icon="image"
              label={m.topo_editTopos()}
              onclick={close}
            />
          {/if}

          {#if canEdit}
            <MenuRow href={editHref} icon="edit" label={m.common_edit()} onclick={close} />

            <MenuRow href={moveHref} icon="map-pin" label={m.blocks_move()} onclick={close} />
          {/if}

          {#if canDelete}
            <MenuRow
              destructive
              icon="map-pin-x"
              label={m.blocks_delete()}
              onclick={() => {
                close()
                onDelete()
              }}
            />
          {/if}
        {/snippet}
      </MoreMenu>
    {/if}
  </ActionBar>
</div>
