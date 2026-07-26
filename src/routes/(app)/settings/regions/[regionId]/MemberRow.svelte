<script lang="ts">
  import { resolve } from '$app/paths'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { RegionMemberItem } from '$lib/entities/region/dto'
  import { assignableRoles, type AppRole, type AssignableRole } from '$lib/entities/rolePermission/dto'
  import { roleLabel } from '$lib/entities/rolePermission/mapper'
  import { m } from '$lib/paraglide/messages'

  // A member as a settings row: label, current role, chevron, same as every other row on the
  // screen. The whole row opens the member's sheet (popover on desktop), which is where the
  // profile link and anything the viewer is allowed to change live.
  interface Props {
    /** The sole remaining admin cannot leave; the server refuses it too. */
    canLeave: boolean
    /** Admin looking at somebody else: the role choices and Remove. */
    canManage: boolean
    member: RegionMemberItem
    onLeave: () => void
    onRemove: () => void
    onRole: (role: AssignableRole) => void
    regionName: string
    role: AppRole
    /** The signed-in user's own row. */
    self: boolean
  }

  const { canLeave, canManage, member, onLeave, onRemove, onRole, regionName, role, self }: Props = $props()

  // Read, edit, everything: the icon says which of the three a role is without reading the label.
  const roleIcons: Record<AssignableRole, IconName> = {
    region_admin: 'settings',
    region_maintainer: 'pickaxe',
    region_user: 'eye',
  }

  let open = $state(false)
  let leaveOpen = $state(false)

  const close = () => (open = false)

  // "Manage" would promise something the sheet does not offer when all it holds is a profile link.
  const subtitle = $derived(canManage || (self && canLeave) ? m.area_manage() : roleLabel(role))
</script>

<!-- panel={false}: a trigger-anchored popover on desktop (this is a page, not the map sheet),
     a bottom sheet on mobile. The mobile branch renders the trigger without wiring, so the
     click handler is ours. -->
<Modal
  backdrop
  bind:open
  panel={false}
  contentClass="max-h-[var(--available-height)] w-80 overflow-y-auto"
  popoverProps={{ positioning: { placement: 'bottom-end' } }}
  {subtitle}
  title={member.username}
>
  {#snippet trigger(props)}
    <button
      {...props}
      type="button"
      class={[props.class, 'hover:bg-surface-100-900 flex w-full items-center gap-3 p-4 text-left']}
      onclick={() => (open = !open)}
    >
      <Avatar name={member.username} size={36} />

      <span class="min-w-0 grow">
        <span class="block truncate font-semibold">{member.username}</span>
        {#if member.invitedBy != null}
          <span class="text-surface-600-400 block truncate text-xs">
            {m.region_invitedBy({ name: member.invitedBy })}
          </span>
        {/if}
      </span>

      <span class="flex flex-none items-center gap-2">
        <span class="text-surface-600-400 text-sm">{roleLabel(role)}</span>
        <Icon name="chevron-right" class="text-surface-400-600" />
      </span>
    </button>
  {/snippet}

  <MenuRow
    href={resolve('/(app)/users/[id]', { id: String(member.userId) })}
    icon="user"
    label={m.region_viewProfile()}
    onclick={close}
  />

  {#if canManage}
    <h3 class="text-surface-600-400 px-1 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase">
      {m.region_role()}
    </h3>

    {#each assignableRoles as option (option)}
      <MenuRow
        icon={roleIcons[option]}
        label={roleLabel(option)}
        selected={option === role}
        onclick={() => {
          close()
          if (option !== role) onRole(option)
        }}
      />
    {/each}

    <!-- Ruled off: directly under the role choices it reads as a fourth role. -->
    <div class="border-surface-200-800 mt-2 border-t pt-2">
      <MenuRow
        destructive
        icon="trash"
        label={m.common_remove()}
        onclick={() => {
          close()
          onRemove()
        }}
      />
    </div>
  {/if}

  {#if self && canLeave}
    <div class="border-surface-200-800 mt-2 border-t pt-2">
      <MenuRow
        destructive
        icon="log-out"
        label={m.region_leave()}
        onclick={() => {
          close()
          leaveOpen = true
        }}
      />
    </div>
  {/if}
</Modal>

<!-- Leaving is irreversible without a fresh invite, so it confirms rather than offering undo.
     Guarded by the same condition as the menu row that opens it: Dialog portals its content into
     the body on mount, so an unguarded one would do that for every member of the region. -->
{#if self && canLeave}
  <Dialog
    open={leaveOpen}
    onOpenChange={(details) => (leaveOpen = details.open)}
    title={m.region_leave()}
    saveText={m.region_leave()}
    onsave={onLeave}
  >
    {#snippet content()}
      {m.region_leaveConfirm({ name: regionName })}
    {/snippet}
  </Dialog>
{/if}
