<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { entityHref } from '$lib/entities/href'
  import { routeEditSeed } from '$lib/entities/route/editSeed'
  import { canEditRoute } from '$lib/entities/route/permissions'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { updateRoute } from '$lib/entities/route/routes.remote'
  import RouteWithBlock from '$lib/entities/route/RouteWithBlock.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { seedForm, seedOnKeyChange } from '$lib/forms/seed.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { isOnline } from '$lib/state/online.svelte'

  const global = getGlobalState()
  const route = routeDetail(() => Number(page.params.id))
  // The block the route lives on frames the form (breadcrumb, region, hidden blockId).
  const block = blockDetail(() => route.data?.blockFk ?? -1)

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

<RouteWithBlock {block} {route}>
  {#snippet ready(detail, blockData)}
    {#if !canEditRoute(global.userRegions, detail)}
      <ErrorState
        type="generic"
        title={m.form_noPermissionTitle()}
        description={m.form_noEditPermission()}
        primaryAction={{
          href: entityHref('routes', detail.id),
          label: m.routes_viewRoute(),
        }}
      />
    {:else if settledRoute == null}
      <!-- No form until the related rows are here, and outside `Form` so there is no Save above
             the spinner: an empty tag list is a valid submission meaning "remove them all". -->
      {#if isOnline()}
        <LoadingIndicator class="flex h-full w-full items-center justify-center" size={20} />
      {:else}
        <!-- Offline the spinner would never resolve. `QueryState` cannot answer this: the
               route's own row IS local, so the resource reads `ready`, never `unsynced`. -->
        <OfflineNotice />
      {/if}
    {:else}
      <Form
        form={updateRoute}
        cancelTo={entityHref('routes', detail.id)}
        submitLabel={m.common_save()}
        title={m.routes_editRoute()}
      >
        <!-- Only rendered fields are submitted, so `fields.set` alone would leave `known` out
               of the form data. -->
        <input type="hidden" {...updateRoute.fields.known.as('text')} />

        <!-- Redundant while the latch above trails a route change by a flush, and kept because
               that only holds while effects run after the render they follow. `RouteFormFields`
               seeds grade, tags and first ascensionists once at mount, so a reused component
               would save the next route carrying this one's values. -->
        {#key detail.id}
          <RouteFormFields block={blockData} form={updateRoute} route={detail} />
        {/key}
      </Form>
    {/if}
  {/snippet}
</RouteWithBlock>
