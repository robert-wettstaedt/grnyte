<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AscentFormFields from '$lib/entities/ascent/AscentFormFields.svelte'
  import { ascentActionSchema, type AscentFormInput } from '$lib/entities/ascent/dto'
  import { canLogAscent } from '$lib/entities/ascent/permissions'
  import { createAscent } from '$lib/entities/ascent/writes'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { finalizeMediaUploads, type MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import { entityHref } from '$lib/entities/href'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
  const store = createFormStore(ascentActionSchema)
  const route = routeDetail(() => Number(page.params.id))
  // The block frames the form's breadcrumb. `-1` while the route loads is the idiom.
  const block = blockDetail(() => route.data?.blockFk ?? -1)

  let uploads = $state<MediaUpload[]>([])

  // `remove()` and not just dropping the array:
  // it is the only thing that aborts the transfer, deletes the staged object and revokes the preview.
  const seed = () => {
    for (const upload of uploads) {
      upload.remove()
    }
    uploads = []
    return {}
  }

  const routeHref = $derived(entityHref('routes', Number(page.params.id)))

  const denied = $derived(
    route.data == null || canLogAscent(global.userRegions, route.data)
      ? undefined
      : {
          description: m.region_notMember(),
          primaryAction: { href: routeHref, label: m.routes_viewRoute() },
          title: m.form_noPermissionTitle(),
        },
  )

  // Record-first media: the ascent is created on submit; pending uploads then finalize against it
  // in the background while the form returns to the route, which already exists.
  const submit = async (values: AscentFormInput) => {
    const created = await createAscent(values)
    const id = created.data?.id
    if (id != null) void finalizeMediaUploads(uploads, { id, type: 'ascent' })
    return created
  }
</script>

<svelte:head>
  <title>{m.routes_logAscent()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  cancelTo={routeHref}
  {denied}
  {seed}
  {store}
  {submit}
  submitLabel={m.common_save()}
  title={m.routes_logAscent()}
  waitFor={[
    { notFound: m.routes_notFound(), resource: route, whole: false },
    { notFound: m.blocks_notFound(), resource: block, whole: false },
  ]}
>
  {#snippet fields([route, block])}
    <AscentFormFields {block} form={store} {route} bind:uploads />
  {/snippet}
</Form>
