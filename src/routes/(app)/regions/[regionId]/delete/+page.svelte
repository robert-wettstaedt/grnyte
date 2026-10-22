<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import QueryError from '$lib/components/QueryState/QueryError.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { entityHref } from '$lib/entities/href'
  import { ownerOnlyDenied } from '$lib/entities/region/adminScreen.svelte'
  import { deleteRegionSchema, type RegionDetail } from '$lib/entities/region/dto'
  import { deleteRegionCommand, regionDeletionPreview } from '$lib/entities/region/regions.remote'
  import { regionDetail } from '$lib/entities/region/resources.svelte'
  import AuthField from '$lib/forms/AuthField.svelte'
  import { submitCommand } from '$lib/forms/command'
  import Form from '$lib/forms/Form.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import type * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { motion } from '$lib/state/motion.svelte'
  import { toaster } from '$lib/state/toast'
  import { slide } from 'svelte/transition'

  const global = getGlobalState()
  const regionId = $derived(Number(page.params.regionId))
  const region = regionDetail(() => regionId)
  const store = createFormStore(deleteRegionSchema)

  const regionHref = $derived(entityHref('regions', regionId))
  const isOwner = $derived(region.data?.ownerFk === global.user?.id)
  const preview = $derived(isOwner ? remoteResource(regionDeletionPreview({ regionFk: regionId })) : undefined)
  const counts = $derived(preview?.data)

  const denied = $derived(ownerOnlyDenied(region.data, global.user?.id))

  const seed = () => ({ name: '', password: '', regionFk: regionId })
  // Sync takes the row away as soon as the delete commits, before the form leaves: keep the last
  // one meanwhile, or the gate flashes "not found", and name the toast from what was typed.
  let deleting = $state('')
  let kept: undefined | { data: RegionDetail; phase: typeof region.phase }
  const shown = {
    get data() {
      if (region.data != null) kept = { data: region.data, phase: region.phase }
      return region.data ?? (deleting === '' ? undefined : kept?.data)
    },
    get phase() {
      return region.data == null && deleting !== '' && kept != null ? kept.phase : region.phase
    },
  }
  const submit = async (values: z.input<typeof deleteRegionSchema>) => {
    deleting = values.name.trim()
    try {
      return await submitCommand(() => deleteRegionCommand(values))
    } catch (cause) {
      deleting = ''
      throw cause
    }
  }
  const onSubmitted = () => {
    toaster.create({ title: m.region_deleted({ name: deleting }), type: 'info' })
  }
</script>

<svelte:head>
  <title>{m.region_delete()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  cancelTo={regionHref}
  {denied}
  destructive
  {onSubmitted}
  {seed}
  {store}
  {submit}
  submitDisabled={preview?.phase.kind !== 'answered'}
  submitLabel={m.region_deleteSubmit()}
  title={m.region_delete()}
  waitFor={[{ notFound: m.region_notFound(), resource: shown, whole: false }]}
>
  {#snippet fields([detail])}
    <p class="text-error-700-300 font-semibold">{m.region_deleteIntro({ region: detail.name })}</p>

    <AuthField
      field={store.fields.name}
      label={m.region_deleteNameLabel({ region: detail.name })}
      type="text"
      autocomplete="off"
      enterkeyhint="next"
    />
    <AuthField
      field={store.fields.password}
      label={m.settings_currentPassword()}
      type="password"
      placeholder={m.auth_passwordPlaceholder()}
      autocomplete="current-password"
      enterkeyhint="go"
    />

    {#if preview?.phase.kind === 'error'}
      <QueryError />
    {/if}
    {#if counts != null && counts.members > 0}
      <div
        class="card preset-tonal-warning space-y-1 p-4 text-sm"
        role="status"
        transition:slide={{ duration: motion(150) }}
      >
        <p>{m.region_deleteMembers({ count: counts.members })}</p>
        {#if counts.ascents > 0}
          <p>{m.region_deleteAscents({ count: counts.ascents })}</p>
        {/if}
      </div>
    {/if}
  {/snippet}
</Form>
