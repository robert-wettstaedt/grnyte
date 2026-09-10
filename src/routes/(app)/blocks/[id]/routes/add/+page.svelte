<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { finalizeMediaUploads, type MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import { canAddRoute } from '$lib/entities/route/permissions'
  import { waitForRoute } from '$lib/entities/route/resources.svelte'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { createRoute } from '$lib/entities/route/routes.remote'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  const global = getGlobalState()
  const block = blockDetail(() => Number(page.params.id))

  let uploads = $state<MediaUpload[]>([])

  // Shares `createRoute` with the topo editor's add-route sheet, and the fields live on one
  // module-level singleton, so a name typed there and abandoned would arrive here pre-filled.
  // `remove()` and not just dropping the array: it is the only thing that aborts the transfer,
  // deletes the staged object and revokes the preview, so media picked for one block cannot
  // keep uploading on the reader's data and finalize against another.
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
    await goto(resolve('/(app)/routes/[id]', { id: String(id) }))
  }
</script>

<svelte:head>
  <title>{m.routes_addRoute()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={block}>
  {#snippet ready(data)}
    {#if canAddRoute(global.userRegions, data)}
      <Form
        form={createRoute}
        onCancel={() => back(resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(data.id) }))}
        {onSubmitted}
        submitLabel={m.common_add()}
        title={m.routes_addRoute()}
      >
        {#key data.id}
          <RouteFormFields block={data} form={createRoute} bind:uploads />
        {/key}
      </Form>
    {:else}
      <ErrorState type="notfound" title={m.blocks_notFound()} />
    {/if}
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.blocks_notFound()} />
  {/snippet}
</QueryState>
