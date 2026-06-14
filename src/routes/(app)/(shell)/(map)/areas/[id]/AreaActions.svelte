<script lang="ts">
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import Action from '$lib/components/Actions/Action.svelte'
  import Actions from '$lib/components/Actions/Actions.svelte'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { canAddArea, canAddBlock, canEditArea } from '$lib/entities/area/permissions'
  import { createBlock } from '$lib/entities/block/blocks.remote'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()
  const global = getGlobalState()

  let addBlockOpen = $state(false)

  const canEdit = $derived(canEditArea(global.userRegions, area))
  const canAdmin = $derived(checkRegionPermission(global.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk))

  // `navigator` is undefined during SSR and `navigator.share` only accepts data
  // it can actually share, so guard on both — the button only appears when the
  // platform supports the Web Share API.
  const shareData = $derived<ShareData>({ text: area.name, title: PUBLIC_APPLICATION_NAME, url: page.url.href })
  const canShare = $derived(browser && navigator.canShare?.(shareData) === true)

  const share = () => {
    // Rejects when the user dismisses the share sheet; nothing to recover from.
    void navigator.share(shareData).catch(() => {})
  }
</script>

<Actions>
  {#if canEdit}
    <Action href={resolve('/(app)/areas/[id]/edit', { id: String(area.id) })}>
      <Icon name="edit" size={16} />
      {m.common_edit()}
    </Action>

    <Action href={resolve('/(app)/areas/[id]/parking/edit', { id: String(area.id) })}>
      <Icon name="parking" size={16} />
      {m.areas_addParkingLocation()}
    </Action>
  {/if}

  {#if canAddArea(global.userRegions, area)}
    <Action href={resolve('/(app)/areas/[id]/add', { id: String(area.id) })}>
      <Icon name="plus" size={16} />
      {m.areas_addArea()}
    </Action>
  {/if}

  {#if canAddBlock(global.userRegions, area)}
    <Action onclick={() => (addBlockOpen = true)}>
      <Icon name="plus" size={16} />
      {m.blocks_addBlock()}
    </Action>

    <Dialog
      open={addBlockOpen}
      onOpenChange={(event) => (addBlockOpen = event.open)}
      onsave={async () => {
        const block = await createBlock({ areaId: area.id })
        await goto(resolve('/(app)/(shell)/(map)/blocks/[id]', { id: String(block.id) }))
      }}
      pending={createBlock.pending}
      saveText={m.common_ok()}
      title={m.blocks_createBlockInTitle({ name: area.name })}
    >
      {#snippet content()}
        {m.blocks_createBlockConfirmation()}
      {/snippet}
    </Dialog>
  {/if}

  {#if canAdmin}
    {#if area.type === 'crag'}
      <Action href={resolve('/(app)/areas/[id]/export', { id: String(area.id) })}>
        <Icon name="file-text" size={16} />
        {m.export_pdf()}
      </Action>
    {/if}

    <Action href={resolve('/(app)/areas/[id]/sync-external-resources', { id: String(area.id) })}>
      <Icon name="sync" size={16} />
      {m.sync_externalResources()}
    </Action>
  {/if}

  {#if canShare}
    <Action onclick={share}>
      <Icon name="share" size={16} />
      {m.share_share()}
    </Action>
  {/if}
</Actions>
