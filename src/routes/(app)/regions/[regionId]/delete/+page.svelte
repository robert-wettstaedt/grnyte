<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import QueryError from '$lib/components/QueryState/QueryError.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { entityHref } from '$lib/entities/href'
  import { ownerOnlyDenied } from '$lib/entities/region/adminScreen.svelte'
  import { deleteRegionSchema } from '$lib/entities/region/dto'
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
  import { holdWhileDeleting, whileDeleting } from '$lib/zero/deleting.svelte'
  import { slide } from 'svelte/transition'

  const global = getGlobalState()
  const regionId = $derived(Number(page.params.regionId))
  const region = regionDetail(() => regionId)
  const store = createFormStore(deleteRegionSchema)

  const regionHref = $derived(entityHref('regions', regionId))
  const isOwner = $derived(region.data?.owner.id === global.user?.id)
  const preview = $derived(isOwner ? remoteResource(regionDeletionPreview({ regionFk: regionId })) : undefined)
  const counts = $derived(preview?.data)

  const denied = $derived(ownerOnlyDenied(region.data, global.user?.id))

  const shown = holdWhileDeleting(region, 'regions', () => regionId)

  const seed = () => ({ name: '', password: '', regionFk: regionId })
  // The region is gone, so the form leaves for settings rather than its own `cancelTo`.
  const submit = (values: z.input<typeof deleteRegionSchema>) =>
    whileDeleting('regions', regionId, async () => {
      await submitCommand(() => deleteRegionCommand(values))
      return { redirectTo: resolve('/settings') }
    })
  const onSubmitted = () => {
    toaster.create({ title: m.region_deleted({ name: shown.data?.name ?? '' }), type: 'info' })
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
