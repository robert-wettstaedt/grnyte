<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import type { ActionItemArgs } from '$lib/components/AppBar'
  import { pageState } from '$lib/components/Layout'
  import { getAreaContext } from '$lib/contexts/area'
  import { convertAreaSlug } from '$lib/helper'
  import { Menu } from '@skeletonlabs/skeleton-svelte'
  import { getI18n } from '$lib/i18n'

  interface Props {
    args: ActionItemArgs
  }
  const { args }: Props = $props()

  let { canAddArea } = $derived(convertAreaSlug())

  const { area } = getAreaContext()
  const { t } = getI18n()
</script>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
  <Menu.ItemGroup>
    <Menu.ItemGroupLabel>{t('entities.area')}</Menu.ItemGroupLabel>

    <Menu.Item value={t('areas.editAreaDetails')}>
      <a {...args.buttonProps} href="{page.url.pathname}/edit">
        <i {...args.iconProps} class="fa-solid fa-pen {args.iconProps.class}"></i>
        {t('areas.editAreaDetails')}
      </a>
    </Menu.Item>

    {#if area.type !== 'sector' && canAddArea}
      <Menu.Item value={t('areas.addArea')}>
        <a {...args.buttonProps} href="{page.url.pathname}/add">
          <i {...args.iconProps} class={args.iconProps.class}></i>
          {t('areas.addArea')}
        </a>
      </Menu.Item>
    {/if}

    {#if area.type === 'sector'}
      <Menu.Item value={t('blocks.addBlock')}>
        <a {...args.buttonProps} href="{page.url.pathname}/_/blocks/add">
          <i {...args.iconProps} class={args.iconProps.class}></i>
          {t('blocks.addBlock')}
        </a>
      </Menu.Item>
    {/if}

    {#if area.type !== 'area'}
      <Menu.Item value={t('areas.addParkingLocation')}>
        <a {...args.buttonProps} href="{page.url.pathname}/edit-parking-location">
          <i {...args.iconProps} class="fa-solid fa-parking {args.iconProps.class}"></i>
          {t('areas.addParkingLocation')}
        </a>
      </Menu.Item>
    {/if}
  </Menu.ItemGroup>
{/if}

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk)}
  <Menu.Separator />

  <Menu.ItemGroup>
    {#if area.type === 'sector'}
      <Menu.Item value={t('export.pdf')}>
        <a {...args.buttonProps} href="{page.url.pathname}/export">
          <i {...args.iconProps} class={args.iconProps.class}></i>
          {t('export.pdf')}
        </a>
      </Menu.Item>
    {/if}

    <Menu.Item value={t('sync.externalResources')}>
      <a {...args.buttonProps} href="{page.url.pathname}/sync-external-resources">
        <i {...args.iconProps} class="fa-solid fa-sync {args.iconProps.class}"></i>
        {t('sync.externalResources')}
      </a>
    </Menu.Item>
  </Menu.ItemGroup>
{/if}
