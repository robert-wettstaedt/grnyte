<script lang="ts">
  import { resolve } from '$app/paths'
  import ActionBar, { ACTION_CTA } from '$lib/components/ActionBar/ActionBar.svelte'
  import DirectionsButton from '$lib/components/DirectionsButton/DirectionsButton.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import MoreMenu from '$lib/components/MoreMenu/MoreMenu.svelte'
  import SaveButton from '$lib/components/SaveButton/SaveButton.svelte'
  import ShareButton from '$lib/components/ShareButton/ShareButton.svelte'
  import { deleteArea, restoreArea } from '$lib/entities/area/areas.remote'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { canAddArea, canAddBlock, canAddParking, canDeleteArea, canEditArea } from '$lib/entities/area/permissions'
  import { waitForArea } from '$lib/entities/area/resources.svelte'
  import type { SaveState } from '$lib/entities/favorite/save.svelte'
  import type { LocationState } from '$lib/entities/geolocation/location.svelte'
  import LocationMeta from '$lib/entities/geolocation/LocationMeta.svelte'
  import type { Coords } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { withUndo } from '$lib/state/toast'

  interface Props {
    area: AreaDetail
    /** Blocks beneath this sector, for the reorder row's gate. */
    blockCount: number
    /** Where to drive, resolved by the page from parking or the block centroid. */
    destination: Coords | undefined
    location: LocationState
    save: SaveState
  }

  const { area, blockCount, destination, location, save }: Props = $props()
  const global = getGlobalState()

  const canEdit = $derived(canEditArea(global.userRegions, area))
  const canDelete = $derived(canDeleteArea(global.userRegions, global.user?.id, area))
  const canAddAreaHere = $derived(canAddArea(global.userRegions, area))
  const canAddBlockHere = $derived(canAddBlock(global.userRegions, area))
  const canAddParkingHere = $derived(canAddParking(global.userRegions, area))

  // The add section has at least one available action. Every manage row needs `canEdit`, so that
  // flag heads the section directly rather than through a wider gate that could head no rows.
  const showAdd = $derived(canAddAreaHere || canAddBlockHere || canAddParkingHere)

  const parkingHref = $derived(resolve('/(app)/areas/[id]/parking/edit', { id: String(area.id) }))

  // The level's main child takes the one labelled slot. A null-typed area is excluded: it is
  // always empty, so `AreaEmpty` already offers both adds.
  const create = $derived.by(() => {
    if (area.type === 'sector' && canAddBlockHere) {
      return { href: resolve('/(app)/areas/[id]/blocks/add', { id: String(area.id) }), label: m.common_block() }
    }
    if (area.type === 'area' && canAddAreaHere) {
      return { href: resolve('/(app)/areas/[id]/add', { id: String(area.id) }), label: m.common_area() }
    }
    return undefined
  })

  const onDelete = () =>
    withUndo(deleteArea({ id: area.id }), {
      message: m.areas_deleted(),
      onUndo: restoreArea,
      waitFor: (data) => waitForArea(data.areaId),
    })
</script>

<div>
  <!-- Only a sector has a location of its own; a sub-area has nothing to say here. -->
  {#if area.type === 'sector'}
    <LocationMeta
      distance={location.distance}
      href={destination == null && canAddParkingHere ? parkingHref : undefined}
      isHere={location.isHere}
      pin={destination == null ? 'missing' : 'set'}
    />
  {/if}

  <ActionBar>
    {#snippet cta()}
      {#if create != null}
        <a class={[ACTION_CTA, 'preset-tonal-primary']} href={create.href}>
          <Icon name="plus" size={18} />
          <span class="truncate text-sm font-bold">{create.label}</span>
        </a>
      {/if}
    {/snippet}

    <DirectionsButton {destination} />

    <SaveButton count={save.count} ontoggle={save.toggle} pending={save.pending} saved={save.saved} />

    <ShareButton text={area.name} />

    {#if showAdd || canEdit || canDelete}
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
              <MenuRow accent href={parkingHref} icon="parking" label={m.areas_addParkingLocation()} onclick={close} />
            {/if}
          {/if}

          {#if canEdit}
            <h3 class="text-surface-500 px-1 pt-4 pb-1 text-xs font-bold tracking-wider uppercase">
              {m.areas_manage()}
            </h3>

            <MenuRow
              href={resolve('/(app)/areas/[id]/edit', { id: String(area.id) })}
              icon="edit"
              label={m.common_edit()}
              onclick={close}
            />

            {#if blockCount > 1}
              <MenuRow
                href={resolve('/(app)/areas/[id]/blocks/order', { id: String(area.id) })}
                icon="grip-vertical"
                label={m.blocks_order_title()}
                onclick={close}
              />
            {/if}
          {/if}

          {#if canDelete}
            <MenuRow
              destructive
              icon="map-pin-x"
              label={m.areas_delete()}
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
