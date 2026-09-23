<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import AscentFormFields from '$lib/entities/ascent/AscentFormFields.svelte'
  import { createAscent } from '$lib/entities/ascent/ascents.remote'
  import { canLogAscent } from '$lib/entities/ascent/permissions'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { finalizeMediaUploads, type MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import { entityHref } from '$lib/entities/href'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import RouteWithBlock from '$lib/entities/route/RouteWithBlock.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
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

<RouteWithBlock {block} {route}>
  {#snippet ready(detail, blockData)}
    {#if canLogAscent(global.userRegions, detail)}
      <Form
        form={createAscent}
        cancelTo={routeHref}
        {onSubmitted}
        submitLabel={m.common_save()}
        title={m.routes_logAscent()}
      >
        {#key detail.id}
          <AscentFormFields block={blockData} form={createAscent} route={detail} bind:uploads />
        {/key}
      </Form>
    {:else}
      <ErrorState
        type="generic"
        title={m.form_noPermissionTitle()}
        description={m.region_notMember()}
        primaryAction={{ href: routeHref, label: m.routes_viewRoute() }}
      />
    {/if}
  {/snippet}
</RouteWithBlock>
