<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { entityHref } from '$lib/entities/href'
  import { routeEditSeed } from '$lib/entities/route/editSeed'
  import { canEditRoute } from '$lib/entities/route/permissions'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { updateRoute } from '$lib/entities/route/routes.remote'
  import Form from '$lib/forms/Form.svelte'
  import { noEditPermission } from '$lib/forms/gate'
  import { seedForm } from '$lib/forms/seed.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
  const route = routeDetail(() => Number(page.params.id))
  // The block the route lives on frames the form (breadcrumb, region, hidden blockId).
  const block = blockDetail(() => route.data?.blockFk ?? -1)

  const routeHref = $derived(entityHref('routes', Number(page.params.id)))

  const denied = $derived(
    route.data == null || canEditRoute(global.userRegions, route.data)
      ? undefined
      : noEditPermission({ href: routeHref, label: m.routes_viewRoute() }),
  )
</script>

<svelte:head>
  <title>{m.routes_editRoute()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<!-- `whole` on the route: the explore map syncs bare routes, and an empty tag list is a valid
     submission meaning "remove them all". `known` has to describe lists that were read whole. -->
<Form
  cancelTo={routeHref}
  {denied}
  form={updateRoute}
  seed={([route]) => void seedForm(updateRoute, routeEditSeed(route))}
  submitLabel={m.common_save()}
  title={m.routes_editRoute()}
  waitFor={[
    { notFound: m.routes_notFound(), resource: route, whole: true },
    { notFound: m.blocks_notFound(), resource: block, whole: false },
  ]}
>
  <!-- Only rendered fields are submitted, so `fields.set` alone would leave `known` out of the form
       data. -->
  <input type="hidden" {...updateRoute.fields.known.as('text')} />

  {#snippet fields([route, block])}
    <RouteFormFields {block} form={updateRoute} {route} />
  {/snippet}
</Form>
