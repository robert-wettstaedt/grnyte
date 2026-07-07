<script lang="ts">
  import { resolve } from '$app/paths'
  import DirectionsButton from '$lib/components/DirectionsButton/DirectionsButton.svelte'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import MoreMenu from '$lib/components/MoreMenu/MoreMenu.svelte'
  import SaveButton from '$lib/components/SaveButton/SaveButton.svelte'
  import ShareButton from '$lib/components/ShareButton/ShareButton.svelte'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import type { RouteDetail } from '$lib/entities/route/dto'
  import { canDeleteRoute, canEditRoute } from '$lib/entities/route/permissions'
  import { waitForRoute } from '$lib/entities/route/resources.svelte'
  import { deleteRoute, restoreRoute } from '$lib/entities/route/routes.remote'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { withUndo } from '$lib/state/toast'

  interface Props {
    route: RouteDetail
    /** The block the route sits on — its pin is the directions target. */
    block: BlockDetail | undefined
  }

  const { route, block }: Props = $props()
  const global = getGlobalState()

  const canEdit = $derived(canEditRoute(global.userRegions, route))
  const canDelete = $derived(canDeleteRoute(global.userRegions, route))

  // Drive to the route's block, when it has a pin.
  const destination = $derived(
    block?.geolocation == null ? undefined : { lat: block.geolocation.lat, long: block.geolocation.long },
  )

  const onDelete = () =>
    withUndo(deleteRoute({ id: route.id }), {
      message: m.routes_deleted(),
      onUndo: restoreRoute,
      waitFor: (data) => waitForRoute(data.routeId),
    })
</script>

<div class="flex gap-2">
  <DirectionsButton {destination} />

  <SaveButton entityId={String(route.id)} entityType="route" regionFk={route.regionFk} />

  <ShareButton text={route.name} />

  {#if canEdit || canDelete}
    <MoreMenu panel={false} title={route.name}>
      {#snippet children(close)}
        <h3 class="text-surface-500 px-1 pt-1 pb-1 text-xs font-bold tracking-wider uppercase">{m.area_manage()}</h3>

        {#if canEdit}
          <MenuRow
            href={resolve('/(app)/routes/[id]/edit', { id: String(route.id) })}
            icon="edit"
            label={m.common_edit()}
            onclick={close}
          />
        {/if}

        {#if canDelete}
          <MenuRow
            destructive
            icon="trash"
            label={m.routes_delete()}
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
