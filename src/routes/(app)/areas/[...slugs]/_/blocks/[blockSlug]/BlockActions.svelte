<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import type { ActionItemArgs } from '$lib/components/AppBar'
  import { pageState } from '$lib/components/Layout'
  import { getBlockContext } from '$lib/contexts/block'
  import { Menu } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    args: ActionItemArgs
  }
  const { args }: Props = $props()

  const { block } = getBlockContext()
</script>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
  <Menu.ItemGroup>
    <Menu.ItemGroupLabel>Block</Menu.ItemGroupLabel>

    <Menu.Item value="Edit block details">
      <a {...args.buttonProps} href={`${page.url.pathname}/edit`}>
        <i {...args.iconProps} class="fa-solid fa-pen {args.iconProps.class}"></i>
        Edit block details
      </a>
    </Menu.Item>

    <Menu.Item value="Add route">
      <a {...args.buttonProps} href={`${page.url.pathname}/routes/add`}>
        <i {...args.iconProps} class={args.iconProps.class}></i>
        Add route
      </a>
    </Menu.Item>
  </Menu.ItemGroup>

  <Menu.Separator />

  <Menu.ItemGroup>
    <Menu.ItemGroupLabel>Topo</Menu.ItemGroupLabel>

    {#if block.topos.length > 0}
      <Menu.Item value="Edit topo">
        <a {...args.buttonProps} href={`${page.url.pathname}/topos/draw`}>
          <i {...args.iconProps} class="fa-solid fa-file-pen {args.iconProps.class}"></i>
          Edit topo
        </a>
      </Menu.Item>
    {/if}

    <Menu.Item value="Upload topo image">
      <a {...args.buttonProps} href={`${page.url.pathname}/topos/add`}>
        <i {...args.iconProps} class={args.iconProps.class}></i>
        Upload topo image
      </a>
    </Menu.Item>
  </Menu.ItemGroup>

  <Menu.Separator />

  <Menu.ItemGroup>
    <Menu.Item value="Edit geolocation">
      <a {...args.buttonProps} href={`${page.url.pathname}/edit-location`}>
        <i {...args.iconProps} class="fa-solid fa-location-dot {args.iconProps.class}"></i>
        Edit geolocation
      </a>
    </Menu.Item>
  </Menu.ItemGroup>
{/if}

{#if block.topos.length > 0}
  <Menu.Separator />

  <Menu.ItemGroup>
    <Menu.Item value="Export block preview">
      <a {...args.buttonProps} href={`${page.url.pathname}/export`}>
        <i {...args.iconProps} class={args.iconProps.class}></i>
        Export block preview
      </a>
    </Menu.Item>
  </Menu.ItemGroup>
{/if}
