<script lang="ts">
  import { page } from '$app/state'
  import Logo27crags from '$lib/assets/27crags-logo.png'
  import Logo8a from '$lib/assets/8a-logo.png'
  import LogoTheCrag from '$lib/assets/thecrag-logo.png'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import type { ActionItemArgs } from '$lib/components/AppBar'
  import { pageState } from '$lib/components/Layout'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { getRouteContext } from '$lib/contexts/route'
  import { queries } from '$lib/db/zero'
  import { Menu } from '@skeletonlabs/skeleton-svelte'
  import { syncExternalResources, toggleRouteFavoriteStatus } from './page.remote'

  interface Props {
    args: ActionItemArgs
    blockPath: string
  }

  const { args, blockPath }: Props = $props()

  const { block, route } = getRouteContext()

  const favoritesResult = $derived(
    page.data.z.q(queries.favorites({ entity: { type: 'route', id: String(route.id) } })),
  )
  const byUser = $derived(favoritesResult.data.some((fav) => fav.authUserFk === page.data.authUserId))
</script>

<Menu.ItemGroup>
  <Menu.ItemGroupLabel>Route</Menu.ItemGroupLabel>

  <Menu.Item value="Log ascent">
    <a {...args.buttonProps} href={`${page.url.pathname}/ascents/add`}>
      <i {...args.iconProps} class="fa-solid fa-check {args.iconProps.class}"></i>
      Log ascent
    </a>
  </Menu.Item>

  <Menu.Item closeOnSelect={false} value="Favorite">
    <button
      {...args.buttonProps}
      disabled={toggleRouteFavoriteStatus.pending > 0}
      onclick={() => route.id != null && toggleRouteFavoriteStatus(route.id)}
    >
      {#if toggleRouteFavoriteStatus.pending > 0}
        <LoadingIndicator {...args.iconProps} />
      {:else}
        <i
          {...args.iconProps}
          class={['fa-solid fa-heart', byUser ? 'text-red-500' : 'text-white', args.iconProps.class]}
        ></i>
      {/if}

      {#if favoritesResult.data.length === 0}
        Favorite
      {:else}
        {favoritesResult.data.length} favorites
      {/if}
    </button>
  </Menu.Item>
</Menu.ItemGroup>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
  <Menu.Separator />

  <Menu.ItemGroup>
    <Menu.ItemGroupLabel>Edit</Menu.ItemGroupLabel>

    <Menu.Item value="Edit route details">
      <a {...args.buttonProps} href={`${page.url.pathname}/edit`}>
        <i {...args.iconProps} class="fa-solid fa-pen {args.iconProps.class}"></i>
        Edit route details
      </a>
    </Menu.Item>

    <Menu.Item value="Edit FA">
      <a {...args.buttonProps} href={`${page.url.pathname}/edit-first-ascent`}>
        <i {...args.iconProps} class="fa-solid fa-pen {args.iconProps.class}"></i>
        Edit FA
      </a>
    </Menu.Item>

    <Menu.Item value="Upload file">
      <a {...args.buttonProps} href={`${page.url.pathname}/add-file`}>
        <i {...args.iconProps} class="fa-solid fa-cloud-arrow-up {args.iconProps.class}"></i>
        Upload file
      </a>
    </Menu.Item>
  </Menu.ItemGroup>
{/if}

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk) && block.topos.length > 0}
  <Menu.Separator />

  <Menu.ItemGroup>
    <Menu.ItemGroupLabel>Topo</Menu.ItemGroupLabel>

    <Menu.Item value="Edit topo">
      <a {...args.buttonProps} href={`${blockPath}/topos/draw`}>
        <i {...args.iconProps} class="fa-solid fa-file-pen {args.iconProps.class}"></i>
        Edit topo
      </a>
    </Menu.Item>
  </Menu.ItemGroup>
{/if}

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], block.regionFk) || route.externalResources?.externalResource8a?.url != null || route.externalResources?.externalResource27crags?.url != null || route.externalResources?.externalResourceTheCrag?.url != null}
  <Menu.Separator />

  <Menu.ItemGroup>
    <Menu.ItemGroupLabel>External Resources</Menu.ItemGroupLabel>

    {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], block.regionFk)}
      <Menu.Item closeOnSelect={false} value="Sync external resources">
        <button
          {...args.buttonProps}
          disabled={syncExternalResources.pending > 0}
          onclick={() => route.id != null && syncExternalResources(route.id)}
        >
          {#if syncExternalResources.pending > 0}
            <LoadingIndicator {...args.iconProps} />
          {:else}
            <i {...args.iconProps} class="fa-solid fa-sync {args.iconProps.class}"></i>
          {/if}

          Sync external resources
        </button>
      </Menu.Item>
    {/if}

    {#if route.id != null}
      {#if route.externalResources?.externalResource8a?.url != null}
        <Menu.Item value="Show on 8a.nu">
          <a {...args.buttonProps} href={route.externalResources?.externalResource8a?.url} target="_blank">
            <img {...args.iconProps} src={Logo8a} alt="8a" width={16} height={16} />
            Show on 8a.nu
          </a>
        </Menu.Item>
      {/if}

      {#if route.externalResources?.externalResource27crags?.url != null}
        <Menu.Item value="Show on 27crags">
          <a {...args.buttonProps} href={route.externalResources?.externalResource27crags?.url} target="_blank">
            <img {...args.iconProps} src={Logo27crags} alt="27crags" width={16} height={16} />
            Show on 27crags
          </a>
        </Menu.Item>
      {/if}

      {#if route.externalResources?.externalResourceTheCrag?.url != null}
        <Menu.Item value="Show on theCrag">
          <a {...args.buttonProps} href={route.externalResources?.externalResourceTheCrag?.url} target="_blank">
            <img {...args.iconProps} src={LogoTheCrag} alt="The Crag" width={16} height={16} />
            Show on theCrag
          </a>
        </Menu.Item>
      {/if}
    {/if}
  </Menu.ItemGroup>
{/if}
