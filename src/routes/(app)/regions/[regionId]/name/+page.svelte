<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { entityHref } from '$lib/entities/href'
  import { regionAdminScreen } from '$lib/entities/region/adminScreen.svelte'
  import { regionActionSchema } from '$lib/entities/region/dto'
  import { updateRegion } from '$lib/entities/region/writes'
  import AuthField from '$lib/forms/AuthField.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seed.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { toaster } from '$lib/state/toast'
  import RegionAdminRequired from '../RegionAdminRequired.svelte'
  import RegionScreen from '../RegionScreen.svelte'

  const screen = regionAdminScreen()
  const store = createFormStore(regionActionSchema)

  // Keyed on `synced`: a membership can land before the region it names, seeding '' under a
  // field the schema rejects. `Form` stays the route's direct child, or its sticky header breaks.
  seedOnKeyChange(
    () => (screen.membership?.synced === true ? screen.regionId : undefined),
    () => {
      // Narrowing only: the key above is undefined whenever the membership is.
      if (screen.membership == null) return
      store.fields.set({ id: String(screen.regionId), name: screen.membership.name })
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
    {store}
    submit={updateRegion}
    cancelTo={entityHref('regions', screen.regionId)}
    {onSubmitted}
    submitLabel={m.common_save()}
    title={m.settings_changeRegionName()}
  >
    <AuthField
      field={store.fields.name}
      label={m.settings_regionName()}
      type="text"
      autocomplete="off"
      enterkeyhint="done"
      autofocus
    />
  </Form>
{/if}
