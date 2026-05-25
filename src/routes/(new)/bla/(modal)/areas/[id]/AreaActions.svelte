<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Dialog from '$lib/components/Dialog'
  import { pageState } from '$lib/components/Layout'
  import { getAreaContext } from '$lib/contexts/area'
  import { getI18n } from '$lib/i18n'
  import { Action, ActionBar } from '../../ActionBar'
  import { createBlock } from './page.remote'

  const { area } = getAreaContext()
  const { t } = getI18n()

  const shareContent = { content: t(`entities.${area.type}`) }
  const shareData: ShareData = {
    text: pageState.user?.username
      ? `${pageState.user.username} ${t('share.wantsToShare', shareContent)}`
      : t('share.iWantToShare', shareContent),
    title: PUBLIC_APPLICATION_NAME,
    url: page.url.toString(),
  }

  let open = $state(false)
</script>

<ActionBar>
  {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
    <Action href={resolve('/(new)/bla/(stack)/areas/[id]/edit', { id: area.id.toString() })}>
      <i class="fa-solid fa-pen-to-square"></i>
      {t('common.edit')}
    </Action>

    {#if area.type !== 'sector'}
      <Action href={resolve('/(new)/bla/(stack)/areas/[id]/add', { id: area.id.toString() })}>
        <i class="fa-solid fa-plus"></i>
        {t('areas.addArea')}
      </Action>
    {/if}

    {#if area.type === 'sector'}
      <Action onclick={() => (open = true)}>
        <i class="fa-solid fa-plus"></i>
        {t('blocks.addBlock')}
      </Action>

      <Dialog
        {open}
        onOpenChange={(event) => (open = event.open)}
        onsave={async () => {
          const block = await createBlock({ areaId: String(area.id) })
          goto(resolve('/(new)/bla/(modal)/blocks/[id]', { id: block.id.toString() }))
        }}
        pending={createBlock.pending}
        saveText={t('common.ok')}
        title={t('blocks.createBlockInTitle', { name: area.name })}
      >
        {#snippet content()}
          {t('blocks.createBlockConfirmation', { count: area.blocks.length + 1 })}
        {/snippet}
      </Dialog>
    {/if}

    {#if area.type !== 'area'}
      <Action href={resolve('/(new)/bla/(stack)/areas/[id]/parking/edit', { id: area.id.toString() })}>
        <i class="fa-solid fa-parking"></i>
        {t('areas.addParkingLocation')}
      </Action>
    {/if}
  {/if}

  {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk)}
    {#if area.type === 'sector'}
      <Action href={resolve('/(new)/bla/(stack)/areas/[id]/export', { id: area.id.toString() })}>
        <i class="fa-solid fa-file-pdf"></i>
        {t('export.pdf')}
      </Action>
    {/if}

    <Action href={resolve('/(new)/bla/(stack)/areas/[id]/sync-external-resources', { id: area.id.toString() })}>
      <i class="fa-solid fa-sync"></i>
      {t('sync.externalResources')}
    </Action>
  {/if}

  {#if navigator.canShare?.(shareData)}
    <button class="btn preset-tonal btn-sm shrink-0 snap-start" onclick={() => navigator.share(shareData)}>
      <i class="fa-solid fa-share-nodes"></i>
      {t('share.share')}
    </button>
  {/if}
</ActionBar>
