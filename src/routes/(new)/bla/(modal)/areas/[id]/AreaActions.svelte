<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import { pageState } from '$lib/components/Layout'
  import { getAreaContext } from '$lib/contexts/area'
  import { getI18n } from '$lib/i18n'

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
</script>

<div class="w-full">
  <div class="flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto scroll-smooth py-4">
    {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
      <a class="btn preset-tonal btn-sm shrink-0 snap-start" href="{page.url.pathname}/edit">
        <i class="fa-solid fa-pen-to-square"></i>
        {t('common.edit')}
      </a>

      {#if area.type !== 'sector'}
        <a class="btn preset-tonal btn-sm shrink-0 snap-start" href="{page.url.pathname}/add">
          <i class="fa-solid fa-plus"></i>
          {t('areas.addArea')}
        </a>
      {/if}

      {#if area.type === 'sector'}
        <a class="btn preset-tonal btn-sm shrink-0 snap-start" href="{page.url.pathname}/blocks/add">
          <i class="fa-solid fa-plus"></i>
          {t('blocks.addBlock')}
        </a>
      {/if}

      {#if area.type !== 'area'}
        <a class="btn preset-tonal btn-sm shrink-0 snap-start" href="{page.url.pathname}/edit-parking-location">
          <i class="fa-solid fa-parking"></i>
          {t('areas.addParkingLocation')}
        </a>
      {/if}
    {/if}

    {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk)}
      {#if area.type === 'sector'}
        <a class="btn preset-tonal btn-sm shrink-0 snap-start" href="{page.url.pathname}/export">
          <i class="fa-solid fa-export"></i>
          {t('export.pdf')}
        </a>
      {/if}

      <a class="btn preset-tonal btn-sm shrink-0 snap-start" href="{page.url.pathname}/sync-external-resources">
        <i class="fa-solid fa-sync"></i>
        {t('sync.externalResources')}
      </a>
    {/if}

    {#if navigator.canShare?.(shareData)}
      <button class="btn preset-tonal btn-sm shrink-0 snap-start" onclick={() => navigator.share(shareData)}>
        <i class="fa-solid fa-share-nodes"></i>
        {t('share.share')}
      </button>
    {/if}
  </div>
</div>
