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
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  const global = getGlobalState()
  const route = routeDetail(() => Number(page.params.id))
  // The block the route lives on frames the form (breadcrumb, region, hidden blockId).
  const block = blockDetail(() => route.data?.blockFk ?? -1)

  // Prefill once per route; reading live data on every change would clobber the user's edits.
  let prefilledId: number | undefined
  $effect(() => {
    const data = route.data
    if (data != null && data.id !== prefilledId) {
      prefilledId = data.id
      updateRoute.fields.set({
        blockId: String(data.blockFk),
        description: data.description,
        firstAscentYear: data.firstAscentYear == null ? '' : String(data.firstAscentYear),
        id: String(data.id),
        name: data.rawName,
      })
    }
  })

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
            <RouteFormFields block={blockData} form={updateRoute} route={detail} />
          </Form>
        {:else}
          <ErrorState type="notfound" title={m.routes_notFound()} />
        {/if}
      {/snippet}
    </QueryState>
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.routes_notFound()} />
  {/snippet}
</QueryState>
