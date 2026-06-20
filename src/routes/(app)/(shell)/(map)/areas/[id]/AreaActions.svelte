<script lang="ts">
  import { browser } from '$app/environment'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { canAddArea, canAddBlock, canEditArea } from '$lib/entities/area/permissions'
  import { createBlock } from '$lib/entities/block/blocks.remote'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import DirectionsButton from './DirectionsButton.svelte'
  import SaveButton from './SaveButton.svelte'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()
  const global = getGlobalState()

  let addBlockOpen = $state(false)
  let moreOpen = $state(false)

  const canEdit = $derived(canEditArea(global.userRegions, area))
  const canAdmin = $derived(checkRegionPermission(global.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk))
  const canAddAreaHere = $derived(canAddArea(global.userRegions, area))
  const canAddBlockHere = $derived(canAddBlock(global.userRegions, area))
  const canExport = $derived(canAdmin && area.type === 'crag')

  // Which sheet sections have at least one available action.
  const showAdd = $derived(canAddAreaHere || canAddBlockHere || canEdit)
  const showManage = $derived(canEdit || canExport || canAdmin)

  // `navigator` is undefined during SSR and `navigator.share` only accepts data
  // it can actually share, so guard on both — the button only appears when the
  // platform supports the Web Share API.
  const shareData = $derived<ShareData>({ text: area.name, title: PUBLIC_APPLICATION_NAME, url: page.url.href })
  const canShare = $derived(browser && navigator.canShare?.(shareData) === true)

  const share = () => {
    // Rejects when the user dismisses the share sheet; nothing to recover from.
    void navigator.share(shareData).catch(() => {})
  }

  const addBlock = () => {
    moreOpen = false
    addBlockOpen = true
  }
</script>

<div class="flex gap-2">
  <DirectionsButton {area} />

  <SaveButton entityId={String(area.id)} entityType="area" regionFk={area.regionFk} />

  {#if canShare}
    <button type="button" class="btn preset-tonal btn-lg h-12 w-12 px-0" aria-label={m.share_share()} onclick={share}>
      <Icon name="share" size={19} />
    </button>
  {/if}

  <Modal
    backdrop
    bind:open={moreOpen}
    popoverProps={{ positioning: { placement: 'right-start' } }}
    subtitle={m.area_manage()}
    title={area.name}
  >
    {#snippet trigger(props)}
      <button
        {...props}
        type="button"
        class={[props.class, 'btn preset-tonal btn-lg h-12 w-12 px-0']}
        aria-label={m.common_more()}
        onclick={() => (moreOpen = !moreOpen)}
      >
        <Icon name="more" />
      </button>
    {/snippet}

    <div class="pb-2">
      {#if showAdd}
        <h3 class="text-surface-500 px-1 pt-1 pb-1 text-xs font-bold tracking-wider uppercase">{m.common_add()}</h3>

        {#if canAddAreaHere}
          {@render row({
            icon: 'area',
            label: m.areas_addArea(),
            accent: true,
            href: resolve('/(app)/areas/[id]/add', { id: String(area.id) }),
          })}
        {/if}

        {#if canAddBlockHere}
          {@render row({ icon: 'block', label: m.blocks_addBlock(), accent: true, onclick: addBlock })}
        {/if}

        {#if canEdit}
          {@render row({
            icon: 'parking',
            label: m.areas_addParkingLocation(),
            accent: true,
            href: resolve('/(app)/areas/[id]/parking/edit', { id: String(area.id) }),
          })}
        {/if}
      {/if}

      {#if showManage}
        <h3 class="text-surface-500 px-1 pt-4 pb-1 text-xs font-bold tracking-wider uppercase">{m.area_manage()}</h3>

        {#if canEdit}
          {@render row({
            icon: 'edit',
            label: m.common_edit(),
            href: resolve('/(app)/areas/[id]/edit', { id: String(area.id) }),
          })}
        {/if}

        {#if canExport}
          {@render row({
            icon: 'file-text',
            label: m.export_pdf(),
            href: resolve('/(app)/areas/[id]/export', { id: String(area.id) }),
          })}
        {/if}

        {#if canAdmin}
          {@render row({
            icon: 'sync',
            label: m.sync_externalResources(),
            href: resolve('/(app)/areas/[id]/sync-external-resources', { id: String(area.id) }),
          })}
        {/if}
      {/if}
    </div>
  </Modal>
</div>

{#if canAddBlockHere}
  <Dialog
    open={addBlockOpen}
    onOpenChange={(event) => (addBlockOpen = event.open)}
    onsave={async () => {
      await createBlock({ areaId: area.id })
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

{#snippet row(opts: { icon: IconName; label: string; accent?: boolean; href?: string; onclick?: () => void })}
  {#snippet body()}
    <span
      class={[
        'flex size-10 flex-none items-center justify-center rounded-xl',
        opts.accent ? 'bg-primary-500/15 text-primary-500' : 'bg-surface-200-800 text-surface-600-400',
      ]}
    >
      <Icon name={opts.icon} size={20} />
    </span>
    <span class="font-medium">{opts.label}</span>
  {/snippet}

  {#if opts.href != null}
    <!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass a resolve()'d href -->
    <a
      class="hover:bg-surface-200-800 flex items-center gap-3 rounded-lg px-1 py-2 transition-colors"
      href={opts.href}
      onclick={() => (moreOpen = false)}
    >
      {@render body()}
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {:else}
    <button
      type="button"
      class="hover:bg-surface-200-800 flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors"
      onclick={opts.onclick}
    >
      {@render body()}
    </button>
  {/if}
{/snippet}
