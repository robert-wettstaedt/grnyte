<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { canEditRoute } from '$lib/entities/route/permissions'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { updateRoute } from '$lib/entities/route/routes.remote'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  const global = getGlobalState()
  const route = routeDetail(() => Number(page.params.id))
  // The block the route lives on frames the form (breadcrumb, region, hidden blockId).
  const block = blockDetail(() => route.data?.blockFk ?? -1)

  // Keyed on the loaded row's id and not the route parameter: the seed reads data, so it has to
  // wait for the row rather than write the previous entity's values under the new id. Re-seeding
  // on every snapshot would clobber edits in progress, which is what the guard is for.
  seedOnKeyChange(
    () => route.data?.id,
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
        {#if canEditRoute(global.userRegions, detail)}
          <Form
            form={updateRoute}
            onCancel={() => back(resolve('/(app)/routes/[id]', { id: String(detail.id) }))}
            {onSubmitted}
            submitLabel={m.common_save()}
            title={m.routes_editRoute()}
          >
            <!-- Keyed on the id: this is one route, so `/x/1/edit` to `/x/2/edit` reuses the component
             rather than remounting it, and Zero answers from the local store so the page never
             passes through a loading state that would rebuild it. The remote fields re-seed on
             an id change, but state seeded once at mount does not, which would save the new
             entity carrying the old one's values. -->
            {#key detail.id}
              <RouteFormFields block={blockData} form={updateRoute} route={detail} />
            {/key}
          </Form>
        {:else}
          <ErrorState
            type="generic"
            title={m.form_noPermission()}
            description={m.form_noEditPermission()}
            primaryAction={{
              href: resolve('/(app)/routes/[id]', { id: String(detail.id) }),
              label: m.routes_viewRoute(),
            }}
          />
        {/if}
      {/snippet}
    </QueryState>
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.routes_notFound()} />
  {/snippet}
</QueryState>
