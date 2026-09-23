<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import AscentFormFields from '$lib/entities/ascent/AscentFormFields.svelte'
  import { updateAscent } from '$lib/entities/ascent/ascents.remote'
  import { canEditAscent } from '$lib/entities/ascent/permissions'
  import { ascentDetail } from '$lib/entities/ascent/resources.svelte'
  import { blockDetail } from '$lib/entities/block/resources.svelte'
  import { entityHref } from '$lib/entities/href'
  import { routeDetail } from '$lib/entities/route/resources.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  const global = getGlobalState()
  const ascent = ascentDetail(() => Number(page.params.id))
  // The route and its block frame the form (context card, breadcrumb, mentions region).
  const route = routeDetail(() => ascent.data?.routeFk ?? -1)
  const block = blockDetail(() => route.data?.blockFk ?? -1)

  // Only read from the ready snippet, where the ascent is loaded (`-1` is the
  // established while-loading idiom).
  const routeHref = $derived(entityHref('routes', ascent.data?.routeFk ?? -1))

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

<QueryState notFound={m.ascents_notFound()} resource={ascent}>
  {#snippet ready(detail)}
    <QueryState notFound={m.routes_notFound()} resource={route}>
      {#snippet ready(routeData)}
        <QueryState notFound={m.blocks_notFound()} resource={block}>
          {#snippet ready(blockData)}
            {#if canEditAscent(global.userRegions, global.user?.id, detail)}
              <Form
                form={updateAscent}
                cancelTo={routeHref}
                submitLabel={m.common_save()}
                title={m.ascents_editAscent()}
              >
                <!-- Keyed on the id: this is one route, so `/x/1/edit` to `/x/2/edit` reuses the component
             rather than remounting it, and Zero answers from the local store so the page never
             passes through a loading state that would rebuild it. The remote fields re-seed on
             an id change, but state seeded once at mount does not, which would save the new
             entity carrying the old one's values. -->
                {#key detail.id}
                  <AscentFormFields ascent={detail} block={blockData} form={updateAscent} route={routeData} />
                {/key}
              </Form>
            {:else}
              <ErrorState
                type="generic"
                title={m.form_noPermissionTitle()}
                description={m.ascents_notYours()}
                primaryAction={{ href: routeHref, label: m.routes_viewRoute() }}
              />
            {/if}
          {/snippet}
        </QueryState>
      {/snippet}
    </QueryState>
  {/snippet}
</QueryState>
