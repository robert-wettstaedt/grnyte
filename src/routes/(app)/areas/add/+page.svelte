<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import AreaFormFields from '$lib/entities/area/AreaFormFields.svelte'
  import { createArea } from '$lib/entities/area/areas.remote'
  import { canAddArea } from '$lib/entities/area/permissions'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  // The top-level counterpart of `/areas/[id]/add`: an area with no parent, which is what a fresh
  // region needs before anything else can exist, and what a region covering two separate forests
  // needs a second of. Same form, same mutation - `AreaFormFields` renders its region select when
  // `parentFk` is absent and there is more than one region to pick from.
  const global = getGlobalState()

  const regions = $derived(
    global.userRegions.filter((region) => canAddArea(global.userRegions, { regionFk: region.regionFk, type: 'area' })),
  )

  // Prefilled from the link that sent them here (the empty-region state carries one), or from the
  // single region they belong to. Only somebody in several regions is asked to pick.
  // Derived, not read once: this is one route, so a value read at init keeps preselecting the
  // region the reader arrived from.
  const requested = $derived(page.url.searchParams.get('regionFk'))
  const preselected = $derived.by(() => {
    const asked = regions.find((region) => String(region.regionFk) === requested)
    if (asked != null) return asked.regionFk
    // A link named a region not in the list yet: memberships arrive row by row, so falling
    // through to "the only one I can see" creates the area somewhere the URL never named.
    if (requested != null) return undefined
    return regions.length === 1 ? regions[0].regionFk : undefined
  })

  // `''` rather than `undefined` when nothing is preselected: it has to match the prompt option's
  // value, or the select binds to nothing and renders as an empty box with no hint at all.
  //
  // Keyed rather than a bare effect: `regions` re-derives whenever memberships resync.
  // Field-level, not a root `fields.set`, which replaces the whole input and would wipe a name
  // being typed. Not free: memberships blinking down to one and back still rewrite the select.
  seedOnKeyChange(
    () => preselected ?? '',
    () => createArea.fields.regionFk.set(preselected == null ? '' : String(preselected)),
  )

  // The fields outlive the component, so a `parentFk` left by `/areas/[id]/add` would nest this
  // top-level area. No reactive reads, so it clears once, on the way in.
  $effect(() => {
    createArea.fields.parentFk.set('')
  })

  const goBack = () => back(resolve('/explore'))
</script>

<svelte:head>
  <title>{m.areas_newArea()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if regions.length === 0}
  <!-- A permission state, not a 404: nobody looked up an area. Reachable by URL, and by the
       explore empty state's CTA if the region's roles change between render and click. -->
  <ErrorState type="generic" title={m.form_noPermissionTitle()} description={m.areas_noAddableRegion()} />
{:else}
  <Form form={createArea} onCancel={goBack} submitLabel={m.common_add()} title={m.areas_newTopLevelArea()}>
    <AreaFormFields form={createArea} />
  </Form>
{/if}
