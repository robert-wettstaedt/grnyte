<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { routeListsFingerprint } from '$lib/entities/route/fingerprint'
  import { canEditRoute } from '$lib/entities/route/permissions'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { updateRoute } from '$lib/entities/route/routes.remote'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { isOnline } from '$lib/state/online.svelte'

  const global = getGlobalState()
  const route = routeDetail(() => Number(page.params.id))
  // The block the route lives on frames the form (breadcrumb, region, hidden blockId).
  const block = blockDetail(() => route.data?.blockFk ?? -1)

  /**
   * Whether this route's RELATED rows are here, not just its own row. The explore map syncs bare
   * routes, so the form can open with `tags` and `firstAscents` still in flight, and `updateRoute`
   * replaces rather than patches. Latched in an effect, not a `$derived`, which would recompute to
   * false whenever the socket parks and tear the form down mid-edit.
   */
  let hydratedId = $state<number | undefined>()
  $effect(() => {
    const id = route.data?.id
    if (id == null || !route.isComplete || hydratedId === id) return
    hydratedId = id
  })

  // Keyed on the hydrated id, not the row's: `known` has to describe lists that were read whole.
  seedOnKeyChange(
    () => hydratedId,
    () => {
      const data = route.data
      if (data == null) {
        return
      }
      updateRoute.fields.set({
        blockId: String(data.blockFk),
        description: data.description,
        firstAscentYear: data.firstAscentYear == null ? '' : String(data.firstAscentYear),
        id: String(data.id),
        known: routeListsFingerprint(data.tags, data.firstAscents),
        name: data.rawName,
      })
    },
  )

  const onSubmitted = async () => {
    const id = updateRoute.result?.data?.id
    if (id == null) return
    await goto(resolve('/(app)/routes/[id]', { id: String(id) }))
  }
</script>

<svelte:head>
  <title>{m.routes_editRoute()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={route}>
  {#snippet ready(detail)}
    <QueryState resource={block}>
      {#snippet ready(blockData)}
        {#if !canEditRoute(global.userRegions, detail)}
          <ErrorState
            type="generic"
            title={m.form_noPermissionTitle()}
            description={m.form_noEditPermission()}
            primaryAction={{
              href: resolve('/(app)/routes/[id]', { id: String(detail.id) }),
              label: m.routes_viewRoute(),
            }}
          />
        {:else if hydratedId !== detail.id}
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
            onCancel={() => back(resolve('/(app)/routes/[id]', { id: String(detail.id) }))}
            {onSubmitted}
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
    </QueryState>
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.routes_notFound()} />
  {/snippet}
</QueryState>
