<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { entityHref } from '$lib/entities/href'
  import { canEditRegion } from '$lib/entities/region/permissions'
  import { updateRegion } from '$lib/entities/region/regions.remote'
  import AuthField from '$lib/forms/AuthField.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { toaster } from '$lib/state/toast'
  import RegionAdminRequired from '../RegionAdminRequired.svelte'

  const global = getGlobalState()

  // Derived, not read once: this is one route, so the page is reused between regions. Read once,
  // Save renamed the region the reader arrived from, under a URL naming the other.
  const regionId = $derived(Number(page.params.regionId))

  // Renaming a region is admin-only, and so is the link into here, so this only catches somebody
  // typing the URL. The server rejects them either way. This is so they find out before typing.
  const isAdmin = $derived(canEditRegion(global.userRegions, regionId))

  // Keyed on `synced`: a membership can land before the region it names, seeding '' under a
  // field the schema rejects. `Form` stays the route's direct child, or its sticky header breaks.
  const membership = $derived(global.userRegions.find((region) => region.regionFk === regionId))
  seedOnKeyChange(
    () => (membership?.synced === true ? regionId : undefined),
    () => {
      // Narrowing only: the key above is undefined whenever the membership is.
      if (membership == null) return
      updateRegion.fields.set({ id: String(regionId), name: membership.name })
    },
  )

  const onSubmitted = () => {
    toaster.create({ title: m.common_saved(), type: 'success' })
  }
</script>

<svelte:head>
  <title>{m.settings_changeRegionName()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if !isAdmin}
  <RegionAdminRequired {regionId} />
{:else}
  <Form
    form={updateRegion}
    cancelTo={entityHref('regions', regionId)}
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
