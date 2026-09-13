<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import AreaFormFields from '$lib/entities/area/AreaFormFields.svelte'
  import { createArea } from '$lib/entities/area/areas.remote'
  import { canAddArea } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'

  const global = getGlobalState()
  const parent = areaDetail(() => Number(page.params.id))

  // Keyed on the parent's id rather than left as a bare effect: `fields.set` replaces the whole
  // input, and `parent.data` is a Zero resource that hands back a new object on every snapshot,
  // so re-running this would wipe a name the reader is part-way through typing.
  seedOnKeyChange(
    () => parent.data?.id,
    () =>
      createArea.fields.set({
        parentFk: parent.data?.id.toString(),
        regionFk: parent.data?.regionFk.toString(),
      }),
  )
</script>

<svelte:head>
  <title>{m.areas_addArea()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState notFound={m.areas_notFound()} resource={parent}>
  {#snippet ready(area)}
    {#if canAddArea(global.userRegions, area)}
      <Form
        form={createArea}
        onCancel={() => back(resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(area.id) }))}
        submitLabel={m.common_add()}
        title={m.areas_newAreaIn({ name: area.name })}
      >
        <AreaFormFields {area} form={createArea} />
      </Form>
    {:else if !checkRegionPermission(global.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
      <ErrorState
        type="generic"
        title={m.form_noPermissionTitle()}
        description={m.form_noEditPermission()}
        primaryAction={{
          href: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(area.id) }),
          label: m.areas_viewArea(),
        }}
      />
    {:else}
      <!-- Not a permission problem: the area is the wrong type to hold this. -->
      <ErrorState
        type="generic"
        title={m.areas_notAnAreaTitle()}
        description={m.areas_notAnAreaBody()}
        primaryAction={{
          href: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(area.id) }),
          label: m.areas_viewArea(),
        }}
      />
    {/if}
  {/snippet}
</QueryState>
