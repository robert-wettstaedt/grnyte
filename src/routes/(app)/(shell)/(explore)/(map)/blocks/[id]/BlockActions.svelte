<script lang="ts">
  import { resolve } from '$app/paths'
  import ActionBar, { ACTION_CTA } from '$lib/components/ActionBar/ActionBar.svelte'
  import DirectionsButton from '$lib/components/DirectionsButton/DirectionsButton.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import MoreMenu from '$lib/components/MoreMenu/MoreMenu.svelte'
  import SaveButton from '$lib/components/SaveButton/SaveButton.svelte'
  import ShareButton from '$lib/components/ShareButton/ShareButton.svelte'
  import { deleteBlock, restoreBlock } from '$lib/entities/block/blocks.remote'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { canDeleteBlock, canEditBlock } from '$lib/entities/block/permissions'
  import { waitForBlock } from '$lib/entities/block/resources.svelte'
  import type { SaveState } from '$lib/entities/favorite/save.svelte'
  import type { LocationState } from '$lib/entities/geolocation/location.svelte'
  import LocationMeta from '$lib/entities/geolocation/LocationMeta.svelte'
  import { canAddRoute } from '$lib/entities/route/permissions'
  import { canEditTopo } from '$lib/entities/topo/permissions'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { withUndo } from '$lib/state/toast'

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

  const pin = $derived(block.geolocation == null ? 'missing' : block.geolocation.estimated ? 'estimated' : 'set')

  // Estimated goes to the edit form, not the move picker: only its checkbox clears the flag.
  const repairHref = $derived.by(() => {
    if (!canEdit) return undefined
    if (pin === 'missing') return moveHref
    if (pin === 'estimated') return editHref
    return undefined
  })

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
    {#snippet cta()}
      {#if canAddRouteHere && routeCount > 0}
        <a
          class={[ACTION_CTA, 'preset-tonal-primary']}
          href={resolve('/(app)/blocks/[id]/routes/add', { id: String(block.id) })}
        >
          <Icon name="plus" size={18} />
          <span class="truncate text-sm font-bold">{m.common_route()}</span>
        </a>
      {/if}
    {/snippet}

    <DirectionsButton {destination} />

    <SaveButton count={save.count} ontoggle={save.toggle} pending={save.pending} saved={save.saved} />

    <ShareButton text={block.name} />

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
