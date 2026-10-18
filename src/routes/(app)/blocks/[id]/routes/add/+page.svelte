<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { finalizeMediaUploads, type MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import { entityHref } from '$lib/entities/href'
  import { routeActionSchema, type RouteFormInput } from '$lib/entities/route/dto'
  import { canAddRoute } from '$lib/entities/route/permissions'
  import { waitForRoute } from '$lib/entities/route/resources.svelte'
  import RouteFormFields from '$lib/entities/route/RouteFormFields.svelte'
  import { createRoute } from '$lib/entities/route/writes'
  import Form from '$lib/forms/Form.svelte'
  import { noEditPermission } from '$lib/forms/gate'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
  const store = createFormStore(routeActionSchema)
  const block = blockDetail(() => Number(page.params.id))

  const blockHref = $derived(entityHref('blocks', Number(page.params.id)))

  const denied = $derived(
    block.data == null || canAddRoute(global.userRegions, block.data)
      ? undefined
      : noEditPermission({ href: blockHref, label: m.blocks_viewBlock() }),
  )

  let uploads = $state<MediaUpload[]>([])

  // `remove()` and not just dropping the array: only it aborts the transfer and deletes the
  // staged object, so media picked for one block cannot finalize against another.
  const seed = ([block]: [{ id: number }]) => {
    for (const upload of uploads) {
      upload.remove()
    }
    uploads = []
    return { blockId: String(block.id) }
  }

  // Record-first media: the route is created on submit; pending uploads then finalize against it in
  // the background while the form leaves for the new route, once Zero has synced its row.
  const submit = async (values: RouteFormInput) => {
    const created = await createRoute(values)
    const id = created.data?.id
    if (id != null) {
      void finalizeMediaUploads(uploads, { id, type: 'route' })
      await waitForRoute(id)
    }
    return created
  }
</script>

<svelte:head>
  <title>{m.routes_addRoute()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  cancelTo={blockHref}
  {denied}
  {seed}
  {store}
  {submit}
  submitLabel={m.common_add()}
  title={m.routes_addRoute()}
  waitFor={[{ notFound: m.blocks_notFound(), resource: block, whole: false }]}
>
  {#snippet fields([block])}
    <RouteFormFields {block} form={store} bind:uploads />
  {/snippet}
</Form>
