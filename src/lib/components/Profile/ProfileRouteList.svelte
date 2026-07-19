<script lang="ts">
  import { resolve } from '$app/paths'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import type { AscentType } from '$lib/entities/ascent/dto'
  import { gradeLabel } from '$lib/entities/grade/label'
  import type { RouteListItem } from '$lib/entities/route/dto'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import type { QueryResource } from '$lib/zero/resource.svelte'

  // A list of route rows (projects, first ascents, favorite routes) sharing the
  // expand-to-reveal "Show on map" / "Details" behaviour. Tapping a row expands it;
  // only one row is open at a time. Long lists collapse to `limit` with a show-more.
  interface Props {
    /** Per-route breadcrumb, e.g. "3 attempts". */
    crumbFor?: (route: RouteListItem) => string | string[] | undefined
    emptyText: string
    /** How many rows to show before "show more". */
    limit?: number
    /** When set, each row gets a remove button (favorites). */
    onRemove?: (route: RouteListItem) => void
    /** Route ids in display order; routes not (yet) synced are skipped. Defaults to the resource order. */
    order?: number[]
    resource: QueryResource<RouteListItem[]>
    /** The user's tick per route, for the row's status glyph. */
    status?: Map<number, AscentType>
  }

  const { crumbFor, emptyText, limit = 6, onRemove, order, resource, status }: Props = $props()
  const global = getGlobalState()

  let activeId = $state<null | number>(null)
  let expanded = $state(false)

  function ordered(routes: RouteListItem[]): RouteListItem[] {
    if (order == null) {
      return routes
    }
    const byId = new Map(routes.map((route) => [route.id, route]))
    return order.map((id) => byId.get(id)).filter((route): route is RouteListItem => route != null)
  }
</script>

<QueryState {resource}>
  {#snippet ready(routes)}
    {@const all = ordered(routes)}
    {@const shown = expanded ? all : all.slice(0, limit)}
    <div class="flex flex-col gap-1.5">
      {#each shown as route (route.id)}
        {#snippet removeAction()}
          <button
            type="button"
            class="btn-icon btn-icon-sm hover:preset-tonal-surface text-surface-500"
            aria-label={m.profile_removeFavorite()}
            onclick={() => onRemove?.(route)}
          >
            <Icon name="close" size={18} />
          </button>
        {/snippet}

        <RouteRow
          {route}
          action={onRemove == null ? undefined : removeAction}
          active={activeId === route.id}
          crumbs={crumbFor?.(route)}
          detailsHref={resolve('/(app)/routes/[id]', { id: String(route.id) })}
          grade={gradeLabel(global.grades, global.gradingScale, route.gradeFk)}
          mapHref={resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(route.blockFk) })}
          onclick={() => (activeId = activeId === route.id ? null : route.id)}
          status={status?.get(route.id)}
        />
      {/each}
    </div>

    {#if all.length > limit && !expanded}
      <button type="button" class="btn preset-tonal-surface mt-1.5 w-full" onclick={() => (expanded = true)}>
        {m.common_showMore()}
      </button>
    {/if}
  {/snippet}

  {#snippet empty()}
    <p class="text-surface-600-400 py-4 text-sm">{emptyText}</p>
  {/snippet}
</QueryState>
