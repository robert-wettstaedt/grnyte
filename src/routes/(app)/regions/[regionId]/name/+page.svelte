<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { entityHref } from '$lib/entities/href'
  import { regionAdminScreen } from '$lib/entities/region/adminScreen.svelte'
  import { updateRegion } from '$lib/entities/region/regions.remote'
  import AuthField from '$lib/forms/AuthField.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seed.svelte'
  import { m } from '$lib/paraglide/messages'
  import { toaster } from '$lib/state/toast'
  import RegionAdminRequired from '../RegionAdminRequired.svelte'
  import RegionScreen from '../RegionScreen.svelte'

  const screen = regionAdminScreen()

  // Keyed on `synced`: a membership can land before the region it names, seeding '' under a
  // field the schema rejects. `Form` stays the route's direct child, or its sticky header breaks.
  seedOnKeyChange(
    () => (screen.membership?.synced === true ? screen.regionId : undefined),
    () => {
      // Narrowing only: the key above is undefined whenever the membership is.
      if (screen.membership == null) return
      updateRegion.fields.set({ id: String(screen.regionId), name: screen.membership.name })
    },
  )

  const onSubmitted = () => {
    toaster.create({ title: m.common_saved(), type: 'success' })
  }
</script>

<svelte:head>
  <title>{m.settings_changeRegionName()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if !screen.isAdmin}
  <RegionScreen backTo={entityHref('regions', screen.regionId)} title={m.settings_changeRegionName()}>
    <RegionAdminRequired regionId={screen.regionId} />
  </RegionScreen>
{:else}
  <Form
    form={updateRegion}
    cancelTo={entityHref('regions', screen.regionId)}
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
