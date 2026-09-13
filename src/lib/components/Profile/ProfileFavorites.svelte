<script lang="ts">
  import { resolve } from '$app/paths'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import AreaRow from '$lib/components/EntityRow/AreaRow.svelte'
  import BlockRow from '$lib/components/EntityRow/BlockRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import ShowMoreList from '$lib/components/Profile/ShowMoreList.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { areaList } from '$lib/entities/area/resources.svelte'
  import type { AscentType } from '$lib/entities/ascent/dto'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { toggleFavorite } from '$lib/entities/favorite/favorites.remote'
  import { userAllFavoriteList } from '$lib/entities/favorite/resources.svelte'
  import { routesByIds } from '$lib/entities/route/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { locationCrumb } from './crumbs'
  import ProfileRouteList from './ProfileRouteList.svelte'
  import SectionHeading from './SectionHeading.svelte'

  // Favorites, grouped by type (public; editing self-only). Loads its own data so the
  // section is self-contained: it renders nothing until the user has favorites.
  interface Props {
    isSelf: boolean
    /** The user’s ascent per route, for the row’s status glyph. */
    status: Map<number, AscentType>
    userId: number
  }

  const { isSelf, status, userId }: Props = $props()

  const favorites = userAllFavoriteList(() => userId)
  const favAreaIds = $derived(
    favorites.data.filter((favorite) => favorite.entityType === 'area').map((favorite) => favorite.entityId),
  )
  const favBlockIds = $derived(
    favorites.data.filter((favorite) => favorite.entityType === 'block').map((favorite) => favorite.entityId),
  )
  const favRouteIds = $derived(
    favorites.data.filter((favorite) => favorite.entityType === 'route').map((favorite) => favorite.entityId),
  )
  const favAreas = areaList(() => ({ id: favAreaIds }), { enabled: () => favAreaIds.length > 0 })
  const favBlocks = blockList(() => ({ blockId: favBlockIds }), { enabled: () => favBlockIds.length > 0 })
  const favRoutes = routesByIds(() => favRouteIds)

  // A favorite outlives the thing it points at: the row survives a soft delete while the entity
  // stops resolving. Gate each list on what came BACK, not on how many ids were stored, or a
  // subheading renders over "Nothing here yet." `isEmpty` is ready-and-empty, so this does not
  // hide a list that is still loading.
  const hasRoutes = $derived(favRouteIds.length > 0 && !favRoutes.isEmpty)
  const hasBlocks = $derived(favBlockIds.length > 0 && !favBlocks.isEmpty)
  const hasAreas = $derived(favAreaIds.length > 0 && !favAreas.isEmpty)

  // Removing a favorite. Zero re-syncs the list, so the row drops out on its own once the write
  // lands.
  const removeFavorite = async (entityType: 'area' | 'block' | 'route', entityId: number): Promise<void> => {
    await toggleFavorite({ entityId, entityType })
  }
  const removeAllFavorites = async (): Promise<void> => {
    await Promise.all(favorites.data.map((f) => toggleFavorite({ entityId: f.entityId, entityType: f.entityType })))
  }

  const FAV_LIMIT = 6
</script>

{#snippet subheading(title: string)}
  <h3 class="text-surface-500 text-xs font-semibold">{title}</h3>
{/snippet}

{#snippet removeButton(onClick: () => void)}
  <button
    type="button"
    class="btn-icon btn-icon-sm hover:preset-tonal-surface text-surface-500"
    aria-label={m.favorite_remove()}
    onclick={onClick}
  >
    <Icon name="close" size={18} />
  </button>
{/snippet}

{#snippet blockRow(block: BlockDetail)}
  {#snippet blockRemove()}
    {@render removeButton(() => removeFavorite('block', block.id))}
  {/snippet}

  <BlockRow
    name={block.name}
    action={isSelf ? blockRemove : undefined}
    crumbs={block.areas.map((area) => area.name)}
    topoImagePath={block.topoImages[0]?.path}
    href={resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(block.id) })}
  />
{/snippet}

{#snippet areaRow(area: AreaDetail)}
  {#snippet areaRemove()}
    {@render removeButton(() => removeFavorite('area', area.id))}
  {/snippet}

  <AreaRow
    name={area.name}
    action={isSelf ? areaRemove : undefined}
    crumbs={area.areas.map((ancestor) => ancestor.name)}
    href={resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(area.id) })}
  />
{/snippet}

{#snippet removeAllAction()}
  <Dialog title={m.profile_removeAll()} saveText={m.profile_removeAll()} onsave={removeAllFavorites}>
    {#snippet trigger(props)}
      <button {...props} type="button" class={[props.class, 'btn btn-sm preset-tonal-surface']}>
        {m.profile_removeAll()}
      </button>
    {/snippet}
    {#snippet content()}
      {m.profile_removeAllConfirm({ count: favorites.data.length })}
    {/snippet}
  </Dialog>
{/snippet}

{#if hasRoutes || hasBlocks || hasAreas}
  <section class="space-y-3">
    <SectionHeading title={m.profile_favorites()} action={isSelf ? removeAllAction : undefined} />

    {#if hasRoutes}
      <div class="space-y-2">
        {@render subheading(m.common_routes())}
        <ProfileRouteList
          resource={favRoutes}
          {status}
          crumbFor={locationCrumb}
          onRemove={isSelf ? (route) => removeFavorite('route', route.id) : undefined}
          emptyText={m.profile_noFavorites()}
        />
      </div>
    {/if}

    {#if hasBlocks}
      <QueryState resource={favBlocks}>
        {#snippet ready(blocks)}
          <div class="space-y-2">
            {@render subheading(m.common_blocks())}
            <ShowMoreList items={blocks} key={(block) => block.id} limit={FAV_LIMIT} row={blockRow} />
          </div>
        {/snippet}
      </QueryState>
    {/if}

    {#if hasAreas}
      <QueryState resource={favAreas}>
        {#snippet ready(areas)}
          <div class="space-y-2">
            {@render subheading(m.common_areas())}
            <ShowMoreList items={areas} key={(area) => area.id} limit={FAV_LIMIT} row={areaRow} />
          </div>
        {/snippet}
      </QueryState>
    {/if}
  </section>
{/if}
