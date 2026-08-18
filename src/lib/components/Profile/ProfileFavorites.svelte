<script lang="ts">
  import { resolve } from '$app/paths'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import AreaRow from '$lib/components/EntityRow/AreaRow.svelte'
  import BlockRow from '$lib/components/EntityRow/BlockRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaList } from '$lib/entities/area/resources.svelte'
  import type { AscentType } from '$lib/entities/ascent/dto'
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
    /** The user's tick per route, for the row's status glyph. */
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

  // Removing a favorite: the entity's regionFk comes off the favorite row. Zero
  // re-syncs the list, so the row drops out on its own once the write lands.
  const removeFavorite = async (entityType: 'area' | 'block' | 'route', entityId: number): Promise<void> => {
    const favorite = favorites.data.find((f) => f.entityType === entityType && f.entityId === entityId)
    if (favorite != null) {
      await toggleFavorite({ entityId, entityType })
    }
  }
  const removeAllFavorites = async (): Promise<void> => {
    await Promise.all(favorites.data.map((f) => toggleFavorite({ entityId: f.entityId, entityType: f.entityType })))
  }

  const FAV_LIMIT = 6
  let blocksExpanded = $state(false)
  let areasExpanded = $state(false)
</script>

{#snippet subheading(title: string)}
  <h3 class="text-surface-500 text-xs font-semibold">{title}</h3>
{/snippet}

{#snippet removeButton(onClick: () => void)}
  <button
    type="button"
    class="btn-icon btn-icon-sm hover:preset-tonal-surface text-surface-500"
    aria-label={m.profile_removeFavorite()}
    onclick={onClick}
  >
    <Icon name="close" size={18} />
  </button>
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

{#if favorites.data.length > 0}
  <section class="space-y-3">
    <SectionHeading title={m.profile_favorites()} action={isSelf ? removeAllAction : undefined} />

    {#if favRouteIds.length > 0}
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

    {#if favBlockIds.length > 0}
      <QueryState resource={favBlocks}>
        {#snippet ready(blocks)}
          <div class="space-y-2">
            {@render subheading(m.common_blocks())}
            <div class="flex flex-col gap-1.5">
              {#each blocksExpanded ? blocks : blocks.slice(0, FAV_LIMIT) as block (block.id)}
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
              {/each}
              {#if blocks.length > FAV_LIMIT && !blocksExpanded}
                <button
                  type="button"
                  class="btn preset-tonal-surface mt-1.5 w-full"
                  onclick={() => (blocksExpanded = true)}
                >
                  {m.common_showMore()}
                </button>
              {/if}
            </div>
          </div>
        {/snippet}
      </QueryState>
    {/if}

    {#if favAreaIds.length > 0}
      <QueryState resource={favAreas}>
        {#snippet ready(areas)}
          <div class="space-y-2">
            {@render subheading(m.common_areas())}
            <div class="flex flex-col gap-1.5">
              {#each areasExpanded ? areas : areas.slice(0, FAV_LIMIT) as area (area.id)}
                {#snippet areaRemove()}
                  {@render removeButton(() => removeFavorite('area', area.id))}
                {/snippet}
                <AreaRow
                  name={area.name}
                  action={isSelf ? areaRemove : undefined}
                  crumbs={area.areas.map((ancestor) => ancestor.name)}
                  href={resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(area.id) })}
                />
              {/each}
              {#if areas.length > FAV_LIMIT && !areasExpanded}
                <button
                  type="button"
                  class="btn preset-tonal-surface mt-1.5 w-full"
                  onclick={() => (areasExpanded = true)}
                >
                  {m.common_showMore()}
                </button>
              {/if}
            </div>
          </div>
        {/snippet}
      </QueryState>
    {/if}
  </section>
{/if}
