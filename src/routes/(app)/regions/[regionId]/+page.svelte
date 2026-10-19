<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import SettingLink from '$lib/components/Setting/SettingLink.svelte'
  import SettingSection from '$lib/components/Setting/SettingSection.svelte'
  import { MEMBERSHIP_UNDO_MS } from '$lib/entities/notification/push'
  import { inviteMemberSchema, type RegionInvitationItem, type RegionMemberItem } from '$lib/entities/region/dto'
  import { invitationDelivery, INVITE_SENDING_MS, regionDisplayName, seatState } from '$lib/entities/region/mapper'
  import { canEditRegion, isLastAdmin } from '$lib/entities/region/permissions'
  import { listRegionInvitations } from '$lib/entities/region/regions.remote'
  import { regionDetail, regionMemberList } from '$lib/entities/region/resources.svelte'
  import { regionTags } from '$lib/entities/region/tagVocabulary'
  import {
    inviteRegionMember,
    leaveRegion,
    removeRegionMember,
    resendRegionInvitation,
    restoreRegionInvitation,
    restoreRegionMember,
    revokeRegionInvitation,
    updateRegionMemberRole,
  } from '$lib/entities/region/writes'
  import type { AppRole, AssignableRole } from '$lib/entities/rolePermission/dto'
  import { resolveIssueMessage } from '$lib/forms/issue'
  import { formError } from '$lib/forms/schemas'
  import { seedOnKeyChange } from '$lib/forms/seed.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { runCommand } from '$lib/remote/mutation'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { now } from '$lib/state/now.svelte'
  import { notifyError, toaster, withUndo } from '$lib/state/toast'
  import InvitationRow from './InvitationRow.svelte'
  import MemberRow from './MemberRow.svelte'

  const global = getGlobalState()

  const regionId = $derived(Number(page.params.regionId))
  const region = regionDetail(() => regionId)
  const members = regionMemberList(() => regionId)

  // Pending invitations come from the server rather than Zero: Zero syncs whole rows and
  // region_invitations carries the token that joins a region. Fetched for every member, not only
  // admins, because a pending invitation holds a seat, so leaving it out would show a member a
  // lower seat count than the admin sitting next to them. Only the list below is admin-only.
  const isAdmin = $derived(canEditRegion(global.userRegions, regionId))

  // Cleared per region, so an abandoned address never follows the reader into the next one's box.
  const inviteStore = createFormStore(inviteMemberSchema)
  let inviting = $state(false)
  seedOnKeyChange(
    () => regionId,
    () => inviteStore.fields.set({ email: '', regionFk: String(regionId) }),
  )

  // From the membership rather than `regionDetail`: settings ride along on the synced region row
  // the shell already holds, so the row needs nothing added to the detail query.
  const membership = $derived(global.userRegions.find((region) => region.regionFk === regionId))
  const mapLayerCount = $derived(membership?.settings.mapLayers.length ?? 0)

  // The one answer this screen gives to "what is this region called": four inline fallbacks had
  // grown here, three of them disagreeing with the mapper.
  const name = $derived(membership == null ? undefined : regionDisplayName(membership))
  const tagCount = $derived(regionTags(global.userRegions, regionId).length)
  const invitations = $derived(listRegionInvitations({ regionFk: regionId }))

  const pending = $derived(invitations.current ?? [])
  const inviteIssues = $derived(inviteStore.fields.allIssues() ?? [])
  const used = $derived((members.data?.length ?? 0) + pending.length)
  const seats = $derived(seatState(used, region.data?.maxMembers ?? 0))

  // A role change is a plain server command with no Zero optimism, so the row shows a local
  // override until Zero syncs the write back. Reverted on failure, same as /settings.
  let roleOverrides = $state<Record<number, AssignableRole>>({})

  const onRole = async (member: RegionMemberItem, role: AssignableRole) => {
    const previous = roleOverrides[member.userId] ?? (member.role as AssignableRole)
    roleOverrides[member.userId] = role

    try {
      await updateRegionMemberRole({ regionFk: regionId, role, userFk: member.userId })
      toaster.create({ title: m.region_roleUpdated(), type: 'success' })
    } catch (cause) {
      roleOverrides[member.userId] = previous
      notifyError(cause)
    }
  }

  const onRemove = async (member: RegionMemberItem) => {
    await withUndo(removeRegionMember(regionId, member.userId), {
      // Bounded on purpose: the removal queues a notice, and undoing inside the window takes
      // it back before it goes out. See MEMBERSHIP_UNDO_MS.
      duration: MEMBERSHIP_UNDO_MS,
      message: m.region_memberRemoved({ name: member.username }),
      onUndo: (snapshot) => restoreRegionMember(snapshot),
    })
  }

  const onLeave = async () => {
    // Captured before the mutation, because leaving revokes the read that named it. Falsy, not
    // just null: a region whose name is '' gave "You left " with nothing after it.
    const leaving = name

    try {
      await runCommand(leaveRegion(regionId))
      toaster.create({
        title: leaving == null ? m.region_leftUnnamed() : m.region_left({ name: leaving }),
        type: 'info',
      })
    } catch (cause) {
      notifyError(cause)
    }
  }

  const displayRole = (member: RegionMemberItem): AppRole => roleOverrides[member.userId] ?? member.role

  // The pending list is a server query, so every invite mutation has to ask for it again; Zero
  // does not carry these rows (they hold the join token).
  const refreshInvitations = () => listRegionInvitations({ regionFk: regionId }).refresh()

  // The mail goes out after commit, so a fresh row reads "sending"; refetched until it settles.
  // A newer send, a region change or leaving the page retires the running loop.
  let settleRun = 0
  $effect(() => {
    void regionId
    return () => settleRun++
  })
  // Only the row just written, and sent-but-unstamped at time zero so the local clock plays no part.
  const unsettled = (email: string) =>
    pending.some((invitation) => invitation.email === email && invitationDelivery(invitation, 0) === 'sending')
  const settleInvitations = async (email: string) => {
    const run = ++settleRun
    // One past the sending window, so the last refetch classifies a failed send as failed.
    for (let attempt = 0; attempt <= INVITE_SENDING_MS / 1000 && unsettled(email); attempt++) {
      await new Promise((done) => setTimeout(done, 1000))
      if (run !== settleRun) return
      await refreshInvitations()
    }
  }

  const afterInviteSaved = async (email: string, title = m.region_inviteSaved({ email })) => {
    toaster.create({ title, type: 'success' })
    await refreshInvitations()
    void settleInvitations(email)
  }

  // "Saved", not "sent": the mail goes out after commit, and the row below says whether it arrived.
  // A refusal (seats full, already a member) lands under the field, and the address stays typed.
  const invite = async (event: SubmitEvent) => {
    event.preventDefault()
    if (inviting) return
    inviting = true
    try {
      const outcome = await inviteStore.submit(inviteRegionMember)
      if (outcome.kind === 'offline') {
        inviteStore.setIssue(null, formError('error_offline_title'))
      } else if (outcome.kind === 'done' && outcome.result.data != null) {
        inviteStore.fields.set({ email: '', regionFk: String(regionId) })
        await afterInviteSaved(outcome.result.data.email)
      }
    } catch (cause) {
      notifyError(cause)
    } finally {
      inviting = false
    }
  }

  // A form-level refusal ("already a member") is about the address, so typing a new one clears it.
  const onInviteInput = (event: Event) => {
    inviteStore.capture(event)
    if (inviteIssues.length > 0) inviteStore.fields.set({ ...inviteStore.fields.value() })
  }

  const onResend = async (invitation: RegionInvitationItem) => {
    try {
      await resendRegionInvitation(invitation.id)
      await afterInviteSaved(invitation.email, m.region_inviteResending({ email: invitation.email }))
    } catch (cause) {
      notifyError(cause)
    }
  }

  const onRevoke = async (invitation: RegionInvitationItem) => {
    // No catch: `withUndo` reports the failure itself. The refresh runs either way.
    await withUndo(revokeRegionInvitation(invitation.id), {
      message: m.region_inviteRevoked({ email: invitation.email }),
      onUndo: async (snapshot) => {
        const result = await restoreRegionInvitation(snapshot)
        await refreshInvitations()
        return result
      },
    })
    await refreshInvitations()
  }

  // Leaving must not orphan the region, so the sole remaining admin cannot. The server refuses
  // it too; this only keeps the button from offering something that always fails, and it asks
  // the same helper the server asks so the two can never disagree.
  const isSoleAdmin = $derived(
    isLastAdmin(
      (members.data ?? []).filter((member) => displayRole(member) === 'region_admin').map((member) => member.userId),
      global.user?.id ?? -1,
    ),
  )
</script>

<svelte:head>
  <title>{name ?? m.region_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/settings'))} title={name ?? m.region_title()} />

<div class="container mx-auto max-w-2xl px-4 py-8 pb-24 md:pb-8">
  <QueryState notFound={m.region_notFound()} resource={region}>
    {#snippet ready(detail)}
      <!-- space-y-8 lives here, not on the container: QueryState is a single child there, so the
             sections it renders would get no spacing between them. -->
      <div class="space-y-8">
        <!-- Region -->
        <SettingSection title={m.region_title()}>
          <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
            <!-- Without an href the row is read-only rather than a disabled control: a
                   greyed-out field reads as "temporarily unavailable" instead of "not yours
                   to change". -->
            <SettingLink
              href={isAdmin ? resolve('/(app)/regions/[regionId]/name', { regionId: String(regionId) }) : undefined}
              label={m.settings_regionName()}
              value={name ?? detail.name}
            />

            {#if detail.createdAt != null}
              <SettingLink
                label={m.region_createdAt()}
                value={formatUploadedAt(detail.createdAt.getTime(), now(), getLocale())}
              />
            {/if}

            <!-- On the creator's id, not their name: the name is a relation that lands after the row,
                 and a row appearing then pushes everything below it down. -->
            {#if detail.createdByFk != null}
              <SettingLink label={m.region_createdBy()} value={detail.createdBy ?? ''} />
            {/if}

            <!-- No count beside it: the seat counter above is live from Zero and a second,
                 snapshot number would drift within one tap. -->
            <SettingLink
              href={resolve('/(app)/regions/[regionId]/stats', { regionId: String(regionId) })}
              label={m.region_stats()}
            />

            <!-- Admin-only rather than read-only like the name row above: a layer count is not
                   information a member can do anything with. -->
            {#if isAdmin}
              <SettingLink
                href={resolve('/(app)/regions/[regionId]/map-layers', { regionId: String(regionId) })}
                label={m.region_mapLayers()}
                value={String(mapLayerCount)}
              />

              <!-- Admin-only like the row above, though applying a tag to a route only needs
                     edit: deciding what the community's vocabulary is, is an admin call. -->
              <SettingLink
                href={resolve('/(app)/regions/[regionId]/tags', { regionId: String(regionId) })}
                label={m.region_tags()}
                value={String(tagCount)}
              />
            {/if}
          </div>
        </SettingSection>

        <!-- Members -->
        <SettingSection title={m.region_members()}>
          {#snippet aside()}
            <!-- A pending invitation holds a seat, so the count waits for them as well. -->
            {#if detail.maxMembers > 0 && members.phase.kind === 'answered' && invitations.current != null}
              <!-- The state is spelled out in the copy as well as the tint, so it does not
                   depend on colour alone. -->
              <span
                class={[
                  'flex items-center gap-1.5 text-xs',
                  seats === 'full'
                    ? 'text-error-600-400'
                    : seats === 'oneLeft'
                      ? 'text-warning-800-200'
                      : 'text-surface-600-400',
                ]}
              >
                {#if seats !== 'ok'}
                  <Icon name="alert-triangle" size={14} />
                {/if}
                {#if seats === 'full'}
                  {m.region_seatsFull({ total: detail.maxMembers })}
                {:else if seats === 'oneLeft'}
                  {m.region_seatsOneLeft({ total: detail.maxMembers, used })}
                {:else}
                  {m.region_seatsUsed({ total: detail.maxMembers, used })}
                {/if}
              </span>
            {/if}
          {/snippet}

          <!-- Settings rows rather than EntityRow cards: this screen is a settings list, so a
                 member reads as a row with a value and a chevron like every other one. -->
          <QueryState resource={members}>
            {#snippet ready(list)}
              <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
                {#each list as member (member.id)}
                  {@const self = member.userId === global.user?.id}

                  <MemberRow
                    canLeave={!isSoleAdmin}
                    canManage={isAdmin && !self}
                    {member}
                    {onLeave}
                    onRemove={() => onRemove(member)}
                    onRole={(role) => onRole(member, role)}
                    regionName={name ?? detail.name}
                    role={displayRole(member)}
                    {self}
                  />
                {/each}
              </div>
            {/snippet}
          </QueryState>
        </SettingSection>

        <!-- Invitations -->
        {#if isAdmin}
          <SettingSection title={m.region_inviteMember()}>
            <!-- One joined input-group at every width rather than stacked-then-inline: a
                   full-width filled button under a full-width field read as a page-level CTA that
                   happened to sit below an input, not as the field's action. The section heading is
                   the group's visible label, so the input carries an aria-label instead of its own.
                   min-h-11 keeps both halves at the 44px touch minimum. -->
            <form oninput={onInviteInput} onsubmit={invite}>
              <div class="input-group min-h-11 grid-cols-[1fr_auto]">
                <input
                  {...inviteStore.fields.email.as('email')}
                  aria-describedby="invite-issues"
                  aria-invalid={inviteIssues.length > 0 || undefined}
                  class="ig-input"
                  aria-label={m.region_inviteEmail()}
                  autocomplete="email"
                  placeholder={m.region_inviteEmail()}
                  required
                  disabled={seats === 'full' || inviting}
                />
                <button type="submit" class="ig-btn preset-filled-primary-500" disabled={seats === 'full' || inviting}>
                  {m.region_invite()}
                </button>
              </div>
            </form>

            <!-- The address stays in the field when the server refuses (seats full, already a
                   member), so a rejected invite never costs the admin the typing. -->
            <div id="invite-issues">
              {#each inviteIssues as issue (issue.message)}
                <p class="text-error-600-400 text-sm" role="alert">{resolveIssueMessage(issue.message)}</p>
              {/each}
            </div>

            <!-- Below the form, which renders at once: the list comes from the server, later. -->
            {#if pending.length > 0}
              <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
                {#each pending as invitation (invitation.id)}
                  <InvitationRow
                    {invitation}
                    onResend={() => onResend(invitation)}
                    onRevoke={() => onRevoke(invitation)}
                  />
                {/each}
              </div>
            {/if}
          </SettingSection>
        {/if}
      </div>
    {/snippet}
  </QueryState>
</div>
