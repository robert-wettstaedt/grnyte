<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AscentFormFields from '$lib/entities/ascent/AscentFormFields.svelte'
  import { createAscent } from '$lib/entities/ascent/ascents.remote'
  import { canLogAscent } from '$lib/entities/ascent/permissions'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { finalizeMediaUploads, type MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import { entityHref } from '$lib/entities/href'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seed.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { exit } from '$lib/state/navigation.svelte'

  const global = getGlobalState()
  const route = routeDetail(() => Number(page.params.id))
  // The block frames the form's breadcrumb. `-1` while the route loads is the idiom.
  const block = blockDetail(() => route.data?.blockFk ?? -1)

  let uploads = $state<MediaUpload[]>([])

  // The fields live on a module-level remote singleton. `{#key}` below covers what
  // AscentFormFields seeds once at mount, including the date, which defaults to today and is
  // the one that lies quietly. `remove()` and not just dropping the array: it is the only
  // thing that aborts the transfer, deletes the staged object and revokes the preview.
  seedOnKeyChange(
    () => page.params.id,
    () => {
      createAscent.fields.set({})
      for (const upload of uploads) {
        upload.remove()
      }
      uploads = []
    },
  )

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

  // Record-first media: the ascent is created on submit; pending uploads then finalize
  // against it in the background while we return to the route page (which shows them
  // once synced; the route row already exists, so no wait is needed).
  const onSubmitted = async () => {
    const id = createAscent.result?.data?.id
    if (id == null) return
    void finalizeMediaUploads(uploads, { id, type: 'ascent' })
    // This page leaves on its own, for the reason the add-route page gives.
    await exit(routeHref)
  }
</script>

<svelte:head>
  <title>{m.routes_logAscent()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  cancelTo={routeHref}
  {denied}
  form={createAscent}
  {onSubmitted}
  submitLabel={m.common_save()}
  title={m.routes_logAscent()}
  waitFor={[
    { notFound: m.routes_notFound(), resource: route },
    { notFound: m.blocks_notFound(), resource: block },
  ]}
>
  {#key route.data!.id}
    <AscentFormFields block={block.data!} form={createAscent} route={route.data!} bind:uploads />
  {/key}
</Form>
