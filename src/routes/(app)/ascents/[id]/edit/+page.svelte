<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AscentFormFields from '$lib/entities/ascent/AscentFormFields.svelte'
  import { updateAscent } from '$lib/entities/ascent/ascents.remote'
  import { canEditAscent } from '$lib/entities/ascent/permissions'
  import { ascentDetail } from '$lib/entities/ascent/resources.svelte'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { entityHref } from '$lib/entities/href'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
  const ascent = ascentDetail(() => Number(page.params.id))
  // The route and its block frame the form (context card, breadcrumb, mentions region).
  const route = routeDetail(() => ascent.data?.routeFk ?? -1)
  const block = blockDetail(() => route.data?.blockFk ?? -1)

  // The ascent's own URL until it loads: it forwards to the route once it knows which.
  const routeHref = $derived(
    ascent.data == null ? entityHref('ascents', Number(page.params.id)) : entityHref('routes', ascent.data.routeFk),
  )

  const denied = $derived(
    ascent.data == null || canEditAscent(global.userRegions, global.user?.id, ascent.data)
      ? undefined
      : {
          description: m.ascents_notYours(),
          primaryAction: { href: routeHref, label: m.routes_viewRoute() },
          title: m.form_noPermissionTitle(),
        },
  )
</script>

<svelte:head>
  <title>{m.ascents_editAscent()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<!-- Each row keys off the one before it, so they wait in order behind one skeleton. -->
<Form
  cancelTo={routeHref}
  {denied}
  form={updateAscent}
  seed={([ascent]) =>
    // The custom inputs seed themselves from the `ascent` prop; this covers the field-driven ones.
    updateAscent.fields.set({
      id: String(ascent.id),
      notes: ascent.notes,
      routeId: String(ascent.routeFk),
      type: ascent.type,
    })}
  submitLabel={m.common_save()}
  title={m.ascents_editAscent()}
  waitFor={[
    { notFound: m.ascents_notFound(), resource: ascent, whole: false },
    { notFound: m.routes_notFound(), resource: route, whole: false },
    { notFound: m.blocks_notFound(), resource: block, whole: false },
  ]}
>
  {#snippet fields([ascent, route, block])}
    <AscentFormFields {ascent} {block} form={updateAscent} {route} />
  {/snippet}
</Form>
