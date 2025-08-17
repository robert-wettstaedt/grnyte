<script lang="ts">
  import { enhance } from '$app/forms'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import RouteFormFields from '$lib/components/RouteFormFields'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import { getRouteContext } from '$lib/contexts/route'
  import { deleteRoute, updateRoute } from './page.remote'

  const { route } = getRouteContext()

  let basePath = $derived(
    `/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}/routes/${page.params.routeSlug}`,
  )

  let grade = $derived(pageState.grades.find((grade) => grade.id === route.gradeFk))
</script>

<svelte:head>
  <title>
    Edit
    {route.rating == null ? '' : `${Array(route.rating).fill('★').join('')} `}
    {route.name}
    {grade == null ? '' : ` (${grade[pageState.gradingScale]})`}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit route</span>
    <a class="anchor" href={basePath}>
      <RouteName {route} />
    </a>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" action="?/updateRoute" method="POST" use:enhance>
  <RouteFormFields
    blockId={route.blockFk}
    description={route.description}
    gradeFk={route.gradeFk}
    name={route.name}
    rating={route.rating ?? null}
    routeId={route.id}
    routeTags={route.tags.map((tag) => tag.tagFk)}
  />

  <input type="hidden" name="redirect" value={page.url.searchParams.get('redirect') ?? ''} />

  <FormActionBar label="Update route" pending={updateRoute.pending} />
</form>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], route.regionFk)}
  <DangerZone name="route" onDelete={() => (route.id == null ? undefined : deleteRoute(route.id))} />
{/if}
