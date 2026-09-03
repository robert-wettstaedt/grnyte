<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { RegionInvitationItem } from '$lib/entities/region/dto'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { now } from '$lib/state/now.svelte'

  // A pending invitation as a settings row, built the way MemberRow builds its own so the two
  // read alike on the same screen: the whole row opens a sheet (popover on desktop) holding the
  // actions. Only admins see this list, so both actions are always available.
  interface Props {
    invitation: RegionInvitationItem
    onResend: () => void
    onRevoke: () => void
  }

  const { invitation, onResend, onRevoke }: Props = $props()

  let open = $state(false)

  const close = () => (open = false)

  // "Sent five minutes ago, give it a moment" vs "sent last week, resend it".
  // Clamped to the clock: `now()` only ticks once a minute, so a send that happened a moment ago is up to
  // 60s "in the future" and would read as "sent in 15 seconds". Every other caller of this
  // formatter shows something at least a minute old, which is why it has not come up before.
  const sentAt = $derived.by(() => {
    if (invitation.lastSentAt == null) return m.region_invitePending()

    const clock = now()
    return m.region_inviteSentAt({
      time: formatUploadedAt(Math.min(invitation.lastSentAt.getTime(), clock), clock, getLocale()),
    })
  })
</script>

<Modal
  backdrop
  bind:open
  panel={false}
  contentClass="max-h-[var(--available-height)] w-80 overflow-y-auto"
  popoverProps={{ positioning: { placement: 'bottom-end' } }}
  subtitle={sentAt}
  title={invitation.email}
>
  {#snippet trigger(props)}
    <button
      {...props}
      type="button"
      class={[props.class, 'hover:bg-surface-100-900 flex w-full items-center gap-3 p-4 text-left']}
      onclick={() => (open = !open)}
    >
      <span class="min-w-0 grow">
        <span class="block truncate">{invitation.email}</span>
        {#if invitation.invitedBy != null}
          <span class="text-surface-600-400 block truncate text-xs">
            {m.region_invitedBy({ name: invitation.invitedBy })}
          </span>
        {/if}
      </span>

      <span class="flex flex-none items-center gap-2">
        <span class="text-surface-600-400 text-sm">{sentAt}</span>
        <Icon name="chevron-right" class="text-surface-400-600" />
      </span>
    </button>
  {/snippet}

  <MenuRow
    icon="sync"
    label={m.region_inviteResend()}
    onclick={() => {
      close()
      onResend()
    }}
  />

  <div class="border-surface-200-800 mt-2 border-t pt-2">
    <MenuRow
      destructive
      icon="close"
      label={m.region_inviteRevoke()}
      onclick={() => {
        close()
        onRevoke()
      }}
    />
  </div>
</Modal>
