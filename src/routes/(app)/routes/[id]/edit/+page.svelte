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
  import { seedForm, seedOnKeyChange } from '$lib/forms/seed.svelte'
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
      : {
          description: m.form_noEditPermission(),
          primaryAction: { href: routeHref, label: m.routes_viewRoute() },
          title: m.form_noPermissionTitle(),
        },
  )

  // `settled`, not the raw row: the explore map syncs bare routes, so this form can open with
  // `tags` and `firstAscents` still in flight, and `updateRoute` replaces rather than patches.
  const settledRoute = $derived(route.settled ? route.data : undefined)

  // Keyed on the settled row's id: `known` has to describe lists that were read whole.
  seedOnKeyChange(
    () => settledRoute?.id,
    () => {
      const data = settledRoute
      if (data == null) {
        return
      }
      void seedForm(updateRoute, routeEditSeed(data))
    },
  )
</script>

<svelte:head>
  <title>{m.routes_editRoute()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<!-- `whole` on the route: no fields until its related rows are here, since an empty tag list is a
     valid submission meaning "remove them all". -->
<Form
  cancelTo={routeHref}
  {denied}
  form={updateRoute}
  submitLabel={m.common_save()}
  title={m.routes_editRoute()}
  waitFor={[
    { notFound: m.routes_notFound(), resource: route, whole: true },
    { notFound: m.blocks_notFound(), resource: block },
  ]}
>
  <!-- Only rendered fields are submitted, so `fields.set` alone would leave `known` out of the form
       data. -->
  <input type="hidden" {...updateRoute.fields.known.as('text')} />

  <!-- Redundant while the latch above trails a route change by a flush, and kept because that only
       holds while effects run after the render they follow. `RouteFormFields` seeds grade, tags and
       first ascensionists once at mount, so a reused component would save the next route carrying
       this one's values. -->
  {#key route.data!.id}
    <RouteFormFields block={block.data!} form={updateRoute} route={route.data!} />
  {/key}
</Form>
