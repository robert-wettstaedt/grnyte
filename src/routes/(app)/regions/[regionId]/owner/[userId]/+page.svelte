<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { entityHref } from '$lib/entities/href'
  import { ownerOnlyDenied, regionDenied } from '$lib/entities/region/adminScreen.svelte'
  import { handOverSchema } from '$lib/entities/region/dto'
  import { transferRegionOwnershipCommand } from '$lib/entities/region/regions.remote'
  import { regionDetail, regionMemberList } from '$lib/entities/region/resources.svelte'
  import AuthField from '$lib/forms/AuthField.svelte'
  import { submitCommand } from '$lib/forms/command'
  import Form from '$lib/forms/Form.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import type * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { toaster } from '$lib/state/toast'

  const global = getGlobalState()
  const regionId = $derived(Number(page.params.regionId))
  const userId = $derived(Number(page.params.userId))
  const region = regionDetail(() => regionId)
  const members = regionMemberList(() => regionId)
  const store = createFormStore(handOverSchema)

  const regionHref = $derived(entityHref('regions', regionId))
  // The recipient as a row of its own, so the form waits for it like for the region. Absent once the
  // list has answered, it is refused below with a way back to the region, not the generic not-found.
  const recipient = {
    get data() {
      return members.data?.find((member) => member.userId === userId)
    },
    get phase() {
      if (this.data != null) return members.phase
      return members.phase.kind === 'answered'
        ? { empty: false, kind: 'answered' as const }
        : { kind: 'loading' as const }
    },
  }

  const refusal = $derived.by(() => {
    if (members.phase.kind !== 'answered') return undefined
    if (recipient.data == null) return regionDenied(regionId, m.region_memberGone(), m.region_memberNotFound())
    if (userId === global.user?.id) return regionDenied(regionId, m.region_cannotChangeOwnRole())
    return recipient.data.role === 'region_admin' ? undefined : regionDenied(regionId, m.region_handOverAdminOnly())
  })
  const denied = $derived(ownerOnlyDenied(region.data, global.user?.id) ?? refusal)

  let handingTo = ''
  const seed = () => ({ password: '', regionFk: regionId, userFk: userId })
  const submit = (values: z.input<typeof handOverSchema>) => {
    handingTo = recipient.data?.username ?? ''
    return submitCommand(() => transferRegionOwnershipCommand(values))
  }
  const onSubmitted = () => {
    toaster.create({ title: m.region_handedOver({ name: handingTo }), type: 'success' })
  }
</script>

<svelte:head>
  <title>{m.region_handOver()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  cancelTo={regionHref}
  {denied}
  {onSubmitted}
  {seed}
  {store}
  {submit}
  submitLabel={m.region_handOver()}
  title={m.region_handOver()}
  waitFor={[
    { notFound: m.region_notFound(), resource: region, whole: false },
    { notFound: m.region_memberNotFound(), resource: recipient, whole: false },
  ]}
>
  {#snippet fields([detail, member])}
    <p>{m.region_handOverIntro({ name: member.username, region: detail.name })}</p>

    <AuthField
      field={store.fields.password}
      label={m.settings_currentPassword()}
      type="password"
      placeholder={m.auth_passwordPlaceholder()}
      autocomplete="current-password"
      enterkeyhint="go"
      autofocus
    />
  {/snippet}
</Form>
