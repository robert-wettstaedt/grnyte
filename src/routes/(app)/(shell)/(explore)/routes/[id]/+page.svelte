<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { canEditRoute } from '$lib/entities/route/permissions'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
  const route = routeDetail(() => Number(page.params.id))

  $inspect(route.data)
</script>

<svelte:head>
  <title>{route.data?.name ?? m.common_route()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<!-- Mock: route detail page — layout and content land here later. The edit entry is
     already real so the route form is reachable. -->
<div class="space-y-2 p-4">
  <h1 class="text-lg font-bold">{route.data?.name ?? `${m.common_route()} #${page.params.id}`}</h1>
  <p class="text-surface-500 text-sm">{m.common_comingSoon()}</p>

  {#if route.data != null && canEditRoute(global.userRegions, route.data)}
    <a class="btn preset-tonal-surface" href={resolve('/(app)/routes/[id]/edit', { id: String(route.data.id) })}>
      <Icon name="edit" size={16} />
      {m.common_edit()}
    </a>
  {/if}
</div>
