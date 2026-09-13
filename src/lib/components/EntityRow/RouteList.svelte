<script lang="ts">
  import { resolve } from '$app/paths'
  import type { AscentStatus } from '$lib/components/EntityRow/types'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { getGlobalState } from '$lib/state/global.svelte'
  import type { ComponentProps, Snippet } from 'svelte'
  import RouteRow from './RouteRow.svelte'

  /** What a row needs, plus the id this list keys and links on. */
  type RouteListEntry = ComponentProps<typeof RouteRow>['route'] & { id: number }

  interface Props {
    /** Rendered after the rows, inside the same nav (an infinite-scroll sentinel). */
    children?: Snippet
    /** Already ordered and already filtered: this only renders. */
    routes: RouteListEntry[]
    /** The user's logged ascent state per route id: `userAscentStatus` satisfies it. */
    status?: { get(routeId: number): AscentStatus | undefined }
  }

  let { children, routes, status }: Props = $props()

  const global = getGlobalState()
</script>

<!-- The route list every surface shows: same order of props, same grade scale, same href, so a
     route reads identically on a block, an area and a profile. -->
<nav class="flex flex-col gap-1.5">
  {#each routes as route (route.id)}
    <RouteRow
      {route}
      grade={gradeLabel(global.grades, global.gradingScale, route.gradeFk)}
      status={status?.get(route.id)}
      href={resolve('/(app)/routes/[id]', { id: String(route.id) })}
    />
  {/each}

  {@render children?.()}
</nav>
