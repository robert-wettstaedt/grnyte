<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import AreaFormFields from '$lib/entities/area/AreaFormFields.svelte'
  import { createArea } from '$lib/entities/area/areas.remote'
  import { canAddArea } from '$lib/entities/area/permissions'
  import Form from '$lib/forms/Form.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  // The top-level counterpart of `/areas/[id]/add`: an area with no parent, which is what a fresh
  // region needs before anything else can exist, and what a region covering two separate forests
  // needs a second of. Same form, same mutation - `AreaFormFields` renders its region select
  // exactly when `parentFk` is absent.
  const global = getGlobalState()

  const regions = $derived(
    global.userRegions.filter((region) => canAddArea(global.userRegions, { regionFk: region.regionFk, type: 'area' })),
  )

  // Prefilled from the link that sent them here (the empty-region state carries one), or from the
  // single region they belong to. Only somebody in several regions is asked to pick.
  const requested = Number(page.url.searchParams.get('regionFk'))
  const preselected = $derived(
    regions.find((region) => region.regionFk === requested)?.regionFk ??
      (regions.length === 1 ? regions[0].regionFk : undefined),
  )

  // `''` rather than `undefined` when nothing is preselected: it has to match the prompt option's
  // value, or the select binds to nothing and renders as an empty box with no hint at all.
  $effect(() => {
    createArea.fields.set({ regionFk: preselected == null ? '' : String(preselected) })
  })

  const goBack = () => back(resolve('/explore'))
</script>

<svelte:head>
  <title>{m.areas_newArea()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if regions.length === 0}
  <!-- A permission state, not a 404: nobody looked up an area. Reachable by URL, and by the
       explore empty state's CTA if the region's roles change between render and click. -->
  <ErrorState type="generic" title={m.form_noPermission()} description={m.areas_noAddableRegion()} />
{:else}
  <Form form={createArea} onCancel={goBack} submitLabel={m.areas_createArea()} title={m.areas_newTopLevelArea()}>
    <AreaFormFields form={createArea} />
  </Form>
{/if}
