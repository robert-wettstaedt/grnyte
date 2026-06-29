<script lang="ts">
  import { resolve } from '$app/paths'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { deleteBlock, restoreBlock } from '$lib/entities/block/blocks.remote'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { canDeleteBlock, canEditBlock } from '$lib/entities/block/permissions'
  import { waitForBlock } from '$lib/entities/block/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { withUndo } from '$lib/state/toast'
  import DirectionsButton from '../../Sheet/DirectionsButton.svelte'
  import MenuRow from '../../Sheet/MenuRow.svelte'
  import MoreMenu from '../../Sheet/MoreMenu.svelte'
  import SaveButton from '../../Sheet/SaveButton.svelte'
  import ShareButton from '../../Sheet/ShareButton.svelte'

  interface Props {
    block: BlockDetail
  }

  const { block }: Props = $props()
  const global = getGlobalState()

  const canEdit = $derived(canEditBlock(global.userRegions, block))
  const canDelete = $derived(canDeleteBlock(global.userRegions, block))

  // Drive straight to the block's own pin, when it has one.
  const destination = $derived(
    block.geolocation == null ? undefined : { lat: block.geolocation.lat, long: block.geolocation.long },
  )

  const moveHref = $derived(resolve('/(app)/blocks/[id]/move', { id: String(block.id) }))

  const onDelete = () =>
    withUndo(deleteBlock({ id: block.id }), {
      message: m.blocks_deleted(),
      onUndo: restoreBlock,
      waitFor: (data) => waitForBlock(data.blockId),
    })
</script>

<div class="flex gap-2">
  {#if block.geolocation != null}
    <DirectionsButton {destination} />
  {:else if canEdit}
    <!-- No pin yet: nudge the editor to place one (the Directions slot would otherwise be empty). -->
    <a class="btn preset-tonal-warning btn-lg flex-1 text-base" href={moveHref}>
      <Icon name="map-pin" size={18} />
      <span class="flex flex-col items-start leading-none">
        <span class="text-sm leading-none font-bold">{m.blocks_addLocation()}</span>
        <span class="text-[10px] leading-none font-normal opacity-80">{m.blocks_locationHint()}</span>
      </span>
    </a>
  {:else}
    <div class="btn preset-tonal-warning btn-lg flex-1 cursor-default text-sm">
      <Icon name="alert-triangle" size={16} />
      {m.blocks_noLocation()}
    </div>
  {/if}

  <SaveButton entityId={String(block.id)} entityType="block" regionFk={block.regionFk} />

  <ShareButton text={block.name} />

  {#if canEdit || canDelete}
    <MoreMenu title={block.name}>
      {#snippet children(close)}
        <h3 class="text-surface-500 px-1 pt-1 pb-1 text-xs font-bold tracking-wider uppercase">{m.area_manage()}</h3>

        {#if canEdit}
          <MenuRow
            href={resolve('/(app)/blocks/[id]/edit', { id: String(block.id) })}
            icon="edit"
            label={m.common_edit()}
            onclick={close}
          />

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
</div>
