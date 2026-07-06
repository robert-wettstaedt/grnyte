<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { finalizeMediaUploads, type MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import { canDeleteRoute, canEditRoute } from '$lib/entities/route/permissions'
  import { routeDetail, waitForRoute } from '$lib/entities/route/resources.svelte'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { deleteRoute, restoreRoute, updateRoute } from '$lib/entities/route/routes.remote'
  import Form from '$lib/forms/Form.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { withUndo } from '$lib/state/toast'

  const global = getGlobalState()
  const route = routeDetail(() => Number(page.params.id))
  // The block the route lives on frames the form (breadcrumb, region, hidden blockId).
  const block = blockDetail(() => route.data?.blockFk ?? -1)

  let uploads = $state<MediaUpload[]>([])

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

  // New media picked while editing finalizes against the route in the background.
  const onSubmitted = async () => {
    const id = updateRoute.result?.data?.id
    if (id == null) return
    void finalizeMediaUploads(uploads, { type: 'route', id })
    await goto(resolve('/(app)/(shell)/(explore)/routes/[id]', { id: String(id) }))
  }

  const onDelete = (id: number) =>
    withUndo(deleteRoute({ id }), {
      message: m.routes_deleted(),
      onUndo: restoreRoute,
      waitFor: (data) => waitForRoute(data.routeId),
    })
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
            onCancel={() => back(resolve('/(app)/(shell)/(explore)/routes/[id]', { id: String(detail.id) }))}
            {onSubmitted}
            submitLabel={m.common_save()}
            title={m.routes_editRoute()}
          >
            <RouteFormFields block={blockData} form={updateRoute} route={detail} bind:uploads />
          </Form>

          {#if canDeleteRoute(global.userRegions, detail)}
            <div class="border-surface-200-800 mx-auto w-full max-w-screen-sm border-t px-4 py-6">
              <button class="btn preset-tonal-error w-full" onclick={() => onDelete(detail.id)} type="button">
                <Icon name="trash" size={16} />
                {m.routes_delete()}
              </button>
              <p class="text-surface-600-400 mt-2 text-center text-xs">{m.routes_deleteNote()}</p>
            </div>
          {/if}
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
