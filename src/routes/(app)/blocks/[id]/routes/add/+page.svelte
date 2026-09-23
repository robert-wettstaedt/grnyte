<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { finalizeMediaUploads, type MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import { entityHref } from '$lib/entities/href'
  import { canAddRoute } from '$lib/entities/route/permissions'
  import { waitForRoute } from '$lib/entities/route/resources.svelte'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { createRoute } from '$lib/entities/route/routes.remote'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { exit } from '$lib/state/navigation.svelte'

  const global = getGlobalState()
  const block = blockDetail(() => Number(page.params.id))

  let uploads = $state<MediaUpload[]>([])

  // Shares `createRoute`'s field singleton with the topo editor's sheet, so a name abandoned
  // there would arrive here pre-filled.
  // `remove()` and not just dropping the array: only it aborts the transfer and deletes the
  // staged object, so media picked for one block cannot finalize against another.
  seedOnKeyChange(
    () => page.params.id,
    () => {
      createRoute.fields.set({})
      for (const upload of uploads) {
        upload.remove()
      }
      uploads = []
    },
  )

  // Record-first media: the route is created on submit; pending uploads then finalize
  // against it in the background while we move on to the new route's page (the wait is
  // for Zero to sync the row, so the detail doesn't flash "not found").
  const onSubmitted = async () => {
    const id = createRoute.result?.data?.id
    if (id == null) return
    void finalizeMediaUploads(uploads, { id, type: 'route' })
    await waitForRoute(id)
    // This page leaves on its own, because the handler cannot declare a destination without
    // discarding the id above. `exit`, so the finished form is retired rather than stacked.
    await exit(entityHref('routes', id))
  }
</script>

<svelte:head>
  <title>{m.routes_addRoute()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState notFound={m.blocks_notFound()} resource={block}>
  {#snippet ready(data)}
    {#if canAddRoute(global.userRegions, data)}
      <Form
        form={createRoute}
        cancelTo={entityHref('blocks', data.id)}
        {onSubmitted}
        submitLabel={m.common_add()}
        title={m.routes_addRoute()}
      >
        {#key data.id}
          <RouteFormFields block={data} form={createRoute} bind:uploads />
        {/key}
      </Form>
    {:else}
      <ErrorState
        type="generic"
        title={m.form_noPermissionTitle()}
        description={m.form_noEditPermission()}
        primaryAction={{
          href: entityHref('blocks', data.id),
          label: m.blocks_viewBlock(),
        }}
      />
    {/if}
  {/snippet}
</QueryState>
