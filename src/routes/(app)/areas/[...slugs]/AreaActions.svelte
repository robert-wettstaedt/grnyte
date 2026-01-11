<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import type { ActionItemArgs } from '$lib/components/AppBar'
  import { pageState } from '$lib/components/Layout'
  import { getAreaContext } from '$lib/contexts/area'
  import { convertAreaSlug } from '$lib/helper'
  import { Menu } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    args: ActionItemArgs
  }
  const { args }: Props = $props()

  let { canAddArea } = $derived(convertAreaSlug())

  const { area } = getAreaContext()
</script>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
  <Menu.ItemGroup>
    <Menu.ItemGroupLabel>Area</Menu.ItemGroupLabel>

    <Menu.Item value="Edit area details">
      <a {...args.buttonProps} href="{page.url.pathname}/edit">
        <i {...args.iconProps} class="fa-solid fa-pen {args.iconProps.class}"></i>
        Edit area details
      </a>
    </Menu.Item>

    {#if area.type !== 'sector' && canAddArea}
      <Menu.Item value="Add area">
        <a {...args.buttonProps} href="{page.url.pathname}/add">
          <i {...args.iconProps} class={args.iconProps.class}></i>
          Add area
        </a>
      </Menu.Item>
    {/if}

    {#if area.type === 'sector'}
      <Menu.Item value="Add block">
        <a {...args.buttonProps} href="{page.url.pathname}/_/blocks/add">
          <i {...args.iconProps} class={args.iconProps.class}></i>
          Add block
        </a>
      </Menu.Item>
    {/if}

    {#if area.type !== 'area'}
      <Menu.Item value="Add parking location">
        <a {...args.buttonProps} href="{page.url.pathname}/edit-parking-location">
          <i {...args.iconProps} class="fa-solid fa-parking {args.iconProps.class}"></i>
          Add parking location
        </a>
      </Menu.Item>
    {/if}
  </Menu.ItemGroup>
{/if}

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk)}
  <Menu.Separator />

  <Menu.ItemGroup>
    {#if area.type === 'sector'}
      <Menu.Item value="Export PDF">
        <a {...args.buttonProps} href="{page.url.pathname}/export">
          <i {...args.iconProps} class={args.iconProps.class}></i>
          Export PDF
        </a>
      </Menu.Item>
    {/if}

    <Menu.Item value="Sync external resources">
      <a {...args.buttonProps} href="{page.url.pathname}/sync-external-resources">
        <i {...args.iconProps} class="fa-solid fa-sync {args.iconProps.class}"></i>
        Sync external resources
      </a>
    </Menu.Item>
  </Menu.ItemGroup>
{/if}
