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
  import { seedOnKeyChange } from '$lib/forms/seed.svelte'
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

  // The custom inputs seed themselves from the `ascent` prop; this covers the field-driven ones
  // (notes).
  // Keyed on the loaded row's id, not the route parameter: the seed reads data, so it has to
  // wait for the row rather than write the previous entity's values under the new id.
  seedOnKeyChange(
    () => ascent.data?.id,
    () => {
      const data = ascent.data
      if (data == null) {
        return
      }
      updateAscent.fields.set({
        id: String(data.id),
        notes: data.notes,
        routeId: String(data.routeFk),
        type: data.type,
      })
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
  submitLabel={m.common_save()}
  title={m.ascents_editAscent()}
  waitFor={[
    { notFound: m.ascents_notFound(), resource: ascent },
    { notFound: m.routes_notFound(), resource: route },
    { notFound: m.blocks_notFound(), resource: block },
  ]}
>
  <!-- Keyed on the id: this is one route, so `/x/1/edit` to `/x/2/edit` reuses the component rather
       than remounting it, and Zero answers from the local store so the page never passes through a
       loading state that would rebuild it. The remote fields re-seed on an id change, but state
       seeded once at mount does not, which would save the new entity carrying the old one's values. -->
  {#key ascent.data!.id}
    <AscentFormFields ascent={ascent.data!} block={block.data!} form={updateAscent} route={route.data!} />
  {/key}
</Form>
