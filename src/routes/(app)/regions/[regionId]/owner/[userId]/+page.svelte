<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ReauthStep, { withReauth } from '$lib/auth/reauth/ReauthStep.svelte'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import { entityHref } from '$lib/entities/href'
  import { ownerOnlyDenied, regionDenied } from '$lib/entities/region/adminScreen.svelte'
  import { handOverSchema } from '$lib/entities/region/dto'
  import { transferRegionOwnershipCommand } from '$lib/entities/region/regions.remote'
  import { regionDetail, regionMemberList } from '$lib/entities/region/resources.svelte'
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
  let confirmed = $state(false)
  let step: ReauthStep | undefined = $state()
  // No `password`: a present key marks a tab from before re-authentication.
  const seed = () => ({ regionFk: regionId, userFk: userId })
  const submit = async (values: z.input<typeof handOverSchema>) => {
    handingTo = recipient.data?.username ?? ''
    return withReauth(step, () => submitCommand(() => transferRegionOwnershipCommand(values)))
  }
  const onSubmitted = () => {
    toaster.create({ title: m.region_handedOver({ name: handingTo }), type: 'success' })
  }
</script>

<svelte:head>
  <title>{m.region_handOverTitle()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<Form
  cancelTo={regionHref}
  {denied}
  {onSubmitted}
  {seed}
  {store}
  {submit}
  submitDisabled={!confirmed}
  submitIcon="user-check"
  submitLabel={m.region_handOverAction()}
  title={m.region_handOverTitle()}
  waitFor={[
    { notFound: m.region_notFound(), resource: region, whole: false },
    { notFound: m.region_memberNotFound(), resource: recipient, whole: false },
  ]}
>
  {#snippet fields([detail, member])}
    <div
      class="border-surface-200-800 flex items-center gap-3 rounded-[14px] border bg-[light-dark(var(--color-surface-50),var(--color-surface-900))] px-3.5 py-3"
    >
      <Avatar name={member.username} size={40} />
      <span class="flex flex-col">
        <strong class="text-[15px]">{member.username}</strong>
        <span class="text-surface-600-400 text-[12.5px]">{m.region_handOverRole({ region: detail.name })}</span>
      </span>
    </div>
    <p class="text-surface-600-400 text-[14.5px] leading-normal">
      {m.region_handOverIntro({ name: member.username, region: detail.name })}
    </p>

    <!-- One route serves every recipient, so the step starts over per region and member. -->
    {#key `${regionId}:${userId}`}
      <ReauthStep
        bind:this={step}
        bind:confirmed
        action="region.transfer"
        email={page.data.session?.user.email ?? ''}
        next={m.region_handOverNext({ name: member.username })}
        target={`${regionId}:${userId}`}
      />
    {/key}
  {/snippet}
</Form>
