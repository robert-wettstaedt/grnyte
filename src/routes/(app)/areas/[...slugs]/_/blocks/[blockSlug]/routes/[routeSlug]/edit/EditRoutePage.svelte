<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import RouteFormFields from '$lib/components/RouteFormFields'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import { getRouteContext } from '$lib/contexts/route'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { deleteRoute, updateRoute } from './page.remote'
  import { getI18n } from '$lib/i18n'

  const { route } = getRouteContext()
  const { t } = getI18n()

  let basePath = $derived(
    `/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}/routes/${page.params.routeSlug}`,
  )

  let grade = $derived(pageState.grades.find((grade) => grade.id === route.gradeFk))
  const stars = $derived(route.rating == null ? '' : `${Array(route.rating).fill('★').join('')} `)
  const gradeSuffix = $derived(grade == null ? '' : ` (${grade[pageState.gradingScale]})`)
  const routeTitle = $derived(`${stars}${route.name}${gradeSuffix}`)
</script>

<svelte:head>
  <title>
    {t('routes.editRouteOfTitle', { name: routeTitle })}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {t('routes.editRoute')}
      <a class="anchor" href={basePath}>
        <RouteName {route} />
      </a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...updateRoute.enhance(enhanceForm())}>
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

  <FormActionBar label={t('routes.updateRoute')} pending={updateRoute.pending} />
</form>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], route.regionFk) || (checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], route.regionFk) && route.createdBy === pageState.user?.id)}
  <DangerZone name={t('entities.route')} onDelete={() => (route.id == null ? undefined : deleteRoute(route.id))} />
{/if}
