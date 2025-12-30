<script lang="ts">
  import { page } from '$app/state'
  import Logo27crags from '$lib/assets/27crags-logo.png'
  import Logo8a from '$lib/assets/8a-logo.png'
  import LogoTheCrag from '$lib/assets/thecrag-logo.png'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import { pageState } from '$lib/components/Layout'
  import { getRouteContext } from '$lib/contexts/route'
  import { queries } from '$lib/db/zero'
  import { Progress } from '@skeletonlabs/skeleton-svelte'
  import { syncExternalResources, toggleRouteFavoriteStatus } from './page.remote'

  interface Props {
    blockPath: string
  }

  const { blockPath }: Props = $props()

  const { block, route } = getRouteContext()

  const favoritesResult = $derived(
    page.data.z.q(queries.favorites(page.data, { entity: { type: 'route', id: String(route.id) } })),
  )
  const byUser = $derived(favoritesResult.data.some((fav) => fav.authUserFk === page.data.authUserId))
</script>

<a class="btn btn-sm preset-filled-primary-500" href={`${page.url.pathname}/ascents/add`}>
  <i class="fa-solid fa-check w-4"></i>Log ascent
</a>

<button
  class="btn btn-sm preset-outlined-primary-500"
  disabled={toggleRouteFavoriteStatus.pending > 0}
  onclick={() => route.id != null && toggleRouteFavoriteStatus(route.id)}
>
  {#if toggleRouteFavoriteStatus.pending > 0}
    <Progress size="size-4" value={null} />
  {:else}
    <i class="fa-solid fa-heart {byUser ? 'text-red-500' : 'text-white'}"></i>
  {/if}

  {#if favoritesResult.data.length === 0}
    Favorite
  {:else}
    {favoritesResult.data.length} favorites
  {/if}
</button>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
  <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/edit`}>
    <i class="fa-solid fa-pen w-4"></i>Edit route details
  </a>

  <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/edit-first-ascent`}>
    <i class="fa-solid fa-pen w-4"></i>Edit FA
  </a>

  {#if block.topos.length > 0}
    <a class="btn btn-sm preset-outlined-primary-500" href={`${blockPath}/topos/draw`}>
      <i class="fa-solid fa-file-pen w-4"></i>Edit topo
    </a>
  {/if}

  <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/add-file`}>
    <i class="fa-solid fa-cloud-arrow-up w-4"></i>Upload file
  </a>
{/if}

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], block.regionFk)}
  <button
    class="btn btn-sm preset-outlined-primary-500"
    disabled={syncExternalResources.pending > 0}
    onclick={() => route.id != null && syncExternalResources(route.id)}
  >
    {#if syncExternalResources.pending > 0}
      <Progress size="size-4" value={null} />
    {:else}
      <i class="fa-solid fa-sync"></i>
    {/if}

    Sync external resources
  </button>
{/if}

{#if route.id != null}
  {#if route.externalResources?.externalResource8a?.url != null}
    <a
      class="btn btn-sm preset-outlined-primary-500"
      href={route.externalResources.externalResource8a.url}
      target="_blank"
    >
      <img src={Logo8a} alt="8a" width={16} height={16} />

      <span class="md:hidden"> Show on 8a.nu </span>
    </a>
  {/if}

  {#if route.externalResources?.externalResource27crags?.url != null}
    <a
      class="btn btn-sm preset-outlined-primary-500"
      href={route.externalResources.externalResource27crags.url}
      target="_blank"
    >
      <img src={Logo27crags} alt="27crags" width={16} height={16} />

      <span class="md:hidden"> Show on 27crags </span>
    </a>
  {/if}

  {#if route.externalResources?.externalResourceTheCrag?.url != null}
    <a
      class="btn btn-sm preset-outlined-primary-500"
      href={route.externalResources.externalResourceTheCrag.url}
      target="_blank"
    >
      <img src={LogoTheCrag} alt="The Crag" width={16} height={16} />

      <span class="md:hidden"> Show on theCrag </span>
    </a>
  {/if}
{/if}
