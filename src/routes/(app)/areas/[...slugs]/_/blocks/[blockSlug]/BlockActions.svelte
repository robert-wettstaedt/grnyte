<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import type { ActionItemArgs } from '$lib/components/AppBar'
  import { pageState } from '$lib/components/Layout'
  import { getBlockContext } from '$lib/contexts/block'
  import { Menu } from '@skeletonlabs/skeleton-svelte'
  import { getI18n } from '$lib/i18n'

  interface Props {
    args: ActionItemArgs
  }
  const { args }: Props = $props()

  const { block } = getBlockContext()
  const { t } = getI18n()
</script>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
  <Menu.ItemGroup>
    <Menu.ItemGroupLabel>{t('entities.block')}</Menu.ItemGroupLabel>

    <Menu.Item value={t('blocks.editBlockDetails')}>
      <a {...args.buttonProps} href={`${page.url.pathname}/edit`}>
        <i {...args.iconProps} class="fa-solid fa-pen {args.iconProps.class}"></i>
        {t('blocks.editBlockDetails')}
      </a>
    </Menu.Item>

    <Menu.Item value={t('routes.addRoute')}>
      <a {...args.buttonProps} href={`${page.url.pathname}/routes/add`}>
        <i {...args.iconProps} class={args.iconProps.class}></i>
        {t('routes.addRoute')}
      </a>
    </Menu.Item>
  </Menu.ItemGroup>

  <Menu.Separator />

  <Menu.ItemGroup>
    <Menu.ItemGroupLabel>{t('topo.title')}</Menu.ItemGroupLabel>

    {#if block.topos.length > 0}
      <Menu.Item value={t('topo.editTopo')}>
        <a {...args.buttonProps} href={`${page.url.pathname}/topos/draw`}>
          <i {...args.iconProps} class="fa-solid fa-file-pen {args.iconProps.class}"></i>
          {t('topo.editTopo')}
        </a>
      </Menu.Item>
    {/if}

    <Menu.Item value={t('topo.uploadTopoImage')}>
      <a {...args.buttonProps} href={`${page.url.pathname}/topos/add`}>
        <i {...args.iconProps} class={args.iconProps.class}></i>
        {t('topo.uploadTopoImage')}
      </a>
    </Menu.Item>
  </Menu.ItemGroup>

  <Menu.Separator />

  <Menu.ItemGroup>
    <Menu.Item value={t('location.editLocation')}>
      <a {...args.buttonProps} href={`${page.url.pathname}/edit-location`}>
        <i {...args.iconProps} class="fa-solid fa-location-dot {args.iconProps.class}"></i>
        {t('location.editLocation')}
      </a>
    </Menu.Item>
  </Menu.ItemGroup>
{/if}

{#if block.topos.length > 0}
  <Menu.Separator />

  <Menu.ItemGroup>
    <Menu.Item value={t('blocks.exportPreview')}>
      <a {...args.buttonProps} href={`${page.url.pathname}/export`}>
        <i {...args.iconProps} class={args.iconProps.class}></i>
        {t('blocks.exportPreview')}
      </a>
    </Menu.Item>
  </Menu.ItemGroup>
{/if}
