<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { MEMBERSHIP_UNDO_MS } from '$lib/entities/notification/push'
  import type { RegionInvitationItem, RegionMemberItem } from '$lib/entities/region/dto'
  import { seatState } from '$lib/entities/region/mapper'
  import { canEditRegion, isLastAdmin } from '$lib/entities/region/permissions'
  import {
    inviteRegionMember,
    leaveRegion,
    listRegionInvitations,
    removeRegionMember,
    resendRegionInvitation,
    restoreRegionInvitation,
    restoreRegionMember,
    revokeRegionInvitation,
    updateRegionMemberRole,
  } from '$lib/entities/region/regions.remote'
  import { regionDetail, regionMemberList } from '$lib/entities/region/resources.svelte'
  import { regionTags } from '$lib/entities/region/tagVocabulary'
  import type { AppRole, AssignableRole } from '$lib/entities/rolePermission/dto'
  import { resolveIssueMessage } from '$lib/forms/issue'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { runCommand } from '$lib/remote/mutation'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { now } from '$lib/state/now.svelte'
  import { notifyError, notifySend, toaster, withUndo } from '$lib/state/toast'
  import SettingLink from '../../SettingLink.svelte'
  import SettingSection from '../../SettingSection.svelte'
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

  // From the membership rather than `regionDetail`: settings ride along on the synced region row
  // the shell already holds, so the row needs nothing added to the detail query.
  const mapLayerCount = $derived(
    global.userRegions.find((region) => region.regionFk === regionId)?.settings?.mapLayers.length ?? 0,
  )
  const tagCount = $derived(regionTags(global.userRegions, regionId).length)
  const invitations = $derived(listRegionInvitations({ regionFk: regionId }))

  const pending = $derived(invitations.current ?? [])
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
    try {
      await withUndo(removeRegionMember({ regionFk: regionId, userFk: member.userId }), {
        // The one bounded undo in the app, and the bound is load-bearing rather than cosmetic:
        // the removal queues a notice for the person removed, and undoing inside this window is
        // what takes it back before it goes out. See MEMBERSHIP_UNDO_MS.
        duration: MEMBERSHIP_UNDO_MS,
        message: m.region_memberRemoved({ name: member.username }),
        onUndo: (snapshot) => restoreRegionMember(snapshot),
      })
    } catch (cause) {
      notifyError(cause)
    }
  }

  const onLeave = async () => {
    const name = region.data?.name ?? ''

    try {
      await runCommand(leaveRegion({ regionFk: regionId }))
      toaster.create({ title: m.region_left({ name }), type: 'info' })
    } catch (cause) {
      notifyError(cause)
    }
  }

  const displayRole = (member: RegionMemberItem): AppRole => roleOverrides[member.userId] ?? member.role

  // The pending list is a server query, so every invite mutation has to ask for it again; Zero
  // does not carry these rows (they hold the join token).
  const refreshInvitations = () => listRegionInvitations({ regionFk: regionId }).refresh()

  const invite = inviteRegionMember.enhance(async ({ submit }) => {
    try {
      await submit()
      const result = inviteRegionMember.result?.data
      if (result == null) return

      await refreshInvitations()
      notifySend(result.sent, m.region_inviteSent({ email: result.email }), m.region_inviteSentNoMail())
      inviteRegionMember.fields.set({ email: '' })
    } catch (cause) {
      // A refusal the schema cannot express (seats full, already a member, role lost since load)
      // comes back as an HttpError, which the form has no field to attach to.
      notifyError(cause)
    }
  })

  const onResend = async (invitation: RegionInvitationItem) => {
    try {
      const result = await resendRegionInvitation({ invitationFk: invitation.id })
      await refreshInvitations()
      notifySend(
        result?.data?.sent ?? false,
        m.region_inviteResent({ email: invitation.email }),
        m.region_inviteSentNoMail(),
      )
    } catch (cause) {
      notifyError(cause)
    }
  }

  const onRevoke = async (invitation: RegionInvitationItem) => {
    try {
      await withUndo(revokeRegionInvitation({ invitationFk: invitation.id }), {
        message: m.region_inviteRevoked({ email: invitation.email }),
        onUndo: async (snapshot) => {
          const result = await restoreRegionInvitation(snapshot)
          await refreshInvitations()
          return result
        },
      })
      await refreshInvitations()
    } catch (cause) {
      notifyError(cause)
    }
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
  <title>{region.data?.name ?? m.region_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/settings'))} title={region.data?.name ?? m.region_title()} />

<div class="container mx-auto max-w-2xl px-4 py-8 pb-24 md:pb-8">
  <QueryState resource={region}>
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
              href={isAdmin
                ? resolve('/(app)/settings/regions/[regionId]/name', { regionId: String(regionId) })
                : undefined}
              label={m.settings_regionName()}
              value={detail.name}
            />

            {#if detail.createdAt != null}
              <SettingLink
                label={m.region_createdAt()}
                value={formatUploadedAt(detail.createdAt.getTime(), now(), getLocale())}
              />
            {/if}

            {#if detail.createdBy != null}
              <SettingLink label={m.region_createdBy()} value={detail.createdBy} />
            {/if}

            <!-- Admin-only rather than read-only like the name row above: a layer count is not
                   information a member can do anything with. -->
            {#if isAdmin}
              <SettingLink
                href={resolve('/(app)/settings/regions/[regionId]/map-layers', { regionId: String(regionId) })}
                label={m.region_mapLayers()}
                value={String(mapLayerCount)}
              />

              <!-- Admin-only like the row above, though applying a tag to a route only needs
                     edit: deciding what the community's vocabulary is, is an admin call. -->
              <SettingLink
                href={resolve('/(app)/settings/regions/[regionId]/tags', { regionId: String(regionId) })}
                label={m.region_tags()}
                value={String(tagCount)}
              />
            {/if}
          </div>
        </SettingSection>

        <!-- Members -->
        <SettingSection title={m.region_members()}>
          {#snippet aside()}
            {#if detail.maxMembers > 0}
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
                    regionName={detail.name}
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

            <!-- One joined input-group at every width rather than stacked-then-inline: a
                   full-width filled button under a full-width field read as a page-level CTA that
                   happened to sit below an input, not as the field's action. The section heading is
                   the group's visible label, so the input carries an aria-label instead of its own.
                   min-h-11 keeps both halves at the 44px touch minimum. -->
            <form {...invite}>
              <!-- The hidden field sits outside the group: input-group rounds its :first-child,
                     and a hidden input still counts as one, which left the email field square and
                     with a stray divider border. -->
              <input type="hidden" name="regionFk" value={regionId} />

              <div class="input-group min-h-11 grid-cols-[1fr_auto]">
                <input
                  {...inviteRegionMember.fields.email.as('email')}
                  class="ig-input"
                  aria-label={m.region_inviteEmail()}
                  autocomplete="email"
                  placeholder={m.region_inviteEmail()}
                  required
                  disabled={seats === 'full' || inviteRegionMember.pending > 0}
                />
                <button
                  type="submit"
                  class="ig-btn preset-filled-primary-500"
                  disabled={seats === 'full' || inviteRegionMember.pending > 0}
                >
                  {m.region_invite()}
                </button>
              </div>
            </form>

            <!-- The address stays in the field when the server refuses (seats full, already a
                   member), so a rejected invite never costs the admin the typing. -->
            {#each inviteRegionMember.fields.email.issues() as issue (issue.message)}
              <p class="text-error-600-400 text-sm" role="alert">{resolveIssueMessage(issue.message)}</p>
            {/each}
          </SettingSection>
        {/if}
      </div>
    {/snippet}
  </QueryState>
</div>
