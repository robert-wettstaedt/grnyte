<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import { canEditRegion } from '$lib/entities/region/permissions'
  import { updateRegion } from '$lib/entities/region/regions.remote'
  import AuthField from '$lib/forms/AuthField.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { toaster } from '$lib/state/toast'

  const global = getGlobalState()

  const regionId = Number(page.params.regionId)

  // Renaming a region is admin-only, and so is the link into here, so this only catches somebody
  // typing the URL. The server rejects them either way. This is so they find out before typing.
  const isAdmin = $derived(canEditRegion(global.userRegions, regionId))

  // Seeded once at init from the memberships the app shell already has, the same way the username
  // page reads global.user. No async load, so `Form` stays the route's direct child: wrapping it
  // in a QueryState puts a flex container between it and the page and breaks its full-height
  // sticky-header layout.
  updateRegion.fields.set({
    id: String(regionId),
    name: global.userRegions.find((region) => region.regionFk === regionId)?.name ?? '',
  })

  const goBack = () => back(resolve('/(app)/settings/regions/[regionId]', { regionId: String(regionId) }))

  const onSubmitted = () => {
    toaster.create({ title: m.common_saved(), type: 'success' })
    goBack()
  }
</script>

<svelte:head>
  <title>{m.settings_changeRegionName()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if !isAdmin}
  <ErrorState type="notfound" title={m.region_notFound()} />
{:else}
  <Form
    form={updateRegion}
    onCancel={goBack}
    {onSubmitted}
    submitLabel={m.common_save()}
    title={m.settings_changeRegionName()}
  >
    <!-- Only rendered fields are submitted, so the id needs an input of its own: seeding it via
       `fields.set` alone leaves it out of the form data, and the schema then fails on a field
       with nothing to attach the error to. -->
    <input type="hidden" {...updateRegion.fields.id.as('text')} />

    <AuthField
      field={updateRegion.fields.name}
      label={m.settings_regionName()}
      type="text"
      autocomplete="off"
      enterkeyhint="done"
      autofocus
    />
  </Form>
{/if}
