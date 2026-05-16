<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import { Action, ActionBar } from '$lib/components/BottomSheetPanel'
  import { pageState } from '$lib/components/Layout'
  import { getBlockContext } from '$lib/contexts/block'
  import { getI18n } from '$lib/i18n'

  const { block } = getBlockContext()
  const { t } = getI18n()

  const shareContent = { content: t('entities.block') }
  const shareData: ShareData = {
    text: pageState.user?.username
      ? `${pageState.user.username} ${t('share.wantsToShare', shareContent)}`
      : t('share.iWantToShare', shareContent),
    title: PUBLIC_APPLICATION_NAME,
    url: page.url.toString(),
  }
</script>

<ActionBar>
  {#if block.geolocationFk == null}
    <Action class="preset-filled-warning-500!" href="{page.url.pathname}/location/edit">
      <i class="fa-solid fa-location-dot"></i>
      {t('location.editLocation')}
    </Action>
  {/if}

  {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
    <Action href="{page.url.pathname}/edit">
      <i class="fa-solid fa-pen-to-square"></i>
      {t('common.edit')}
    </Action>

    <Action href="{page.url.pathname}/routes/add">
      <i class="fa-solid fa-plus"></i>
      {t('routes.addRoute')}
    </Action>

    {#if block.geolocationFk != null}
      <Action href="{page.url.pathname}/location/edit">
        <i class="fa-solid fa-location-dot"></i>
        {t('location.editLocation')}
      </Action>
    {/if}
  {/if}

  {#if block.topos.length > 0}
    <Action href="{page.url.pathname}/export">
      <i class="fa-solid fa-arrow-up-right-from-square"></i>
      {t('blocks.exportPreview')}
    </Action>
  {/if}

  {#if navigator.canShare?.(shareData)}
    <button class="btn preset-tonal btn-sm shrink-0 snap-start" onclick={() => navigator.share(shareData)}>
      <i class="fa-solid fa-share-nodes"></i>
      {t('share.share')}
    </button>
  {/if}
</ActionBar>
