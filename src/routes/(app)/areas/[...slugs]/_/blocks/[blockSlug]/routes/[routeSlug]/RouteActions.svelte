<script lang="ts">
  import { page } from '$app/state'
  import Logo27crags from '$lib/assets/27crags-logo.png'
  import Logo8a from '$lib/assets/8a-logo.png'
  import LogoTheCrag from '$lib/assets/thecrag-logo.png'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import ZeroQueryWrapper, { type ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import type { PageProps } from './$types'
  import { syncExternalResources } from './page.remote'

  interface Props {
    block: ZeroQueryResult<PageProps['data']['query']>
    blockPath: string
    route: ZeroQueryResult<PageProps['data']['query']>['routes'][0]
  }

  const { block, blockPath, route }: Props = $props()
</script>

<a class="btn btn-sm preset-filled-primary-500" href={`${page.url.pathname}/ascents/add`}>
  <i class="fa-solid fa-check w-4"></i>Log ascent
</a>

{#if checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
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

{#if checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_ADMIN], block.regionFk)}
  <button
    class="btn btn-sm preset-outlined-primary-500"
    disabled={syncExternalResources.pending > 0}
    onclick={() => route.id != null && syncExternalResources(route.id)}
  >
    {#if syncExternalResources.pending > 0}
      <ProgressRing size="size-4" value={null} />
    {:else}
      <i class="fa-solid fa-sync"></i>
    {/if}

    Sync external resources
  </button>
{/if}

{#if route.id != null}
  <ZeroQueryWrapper
    query={page.data.z.current.query.routeExternalResources
      .where('routeFk', route.id)
      .related('externalResource27crags')
      .related('externalResource8a')
      .related('externalResourceTheCrag')
      .one()}
  >
    {#snippet children(externalResources)}
      {#if externalResources?.externalResource8a?.url != null}
        <a
          class="btn btn-sm preset-outlined-primary-500"
          href={externalResources.externalResource8a.url}
          target="_blank"
        >
          <img src={Logo8a} alt="8a" width={16} height={16} />

          <span class="md:hidden"> Show on 8a.nu </span>
        </a>
      {/if}

      {#if externalResources?.externalResource27crags?.url != null}
        <a
          class="btn btn-sm preset-outlined-primary-500"
          href={externalResources.externalResource27crags.url}
          target="_blank"
        >
          <img src={Logo27crags} alt="27crags" width={16} height={16} />

          <span class="md:hidden"> Show on 27crags </span>
        </a>
      {/if}

      {#if externalResources?.externalResourceTheCrag?.url != null}
        <a
          class="btn btn-sm preset-outlined-primary-500"
          href={externalResources.externalResourceTheCrag.url}
          target="_blank"
        >
          <img src={LogoTheCrag} alt="The Crag" width={16} height={16} />

          <span class="md:hidden"> Show on theCrag </span>
        </a>
      {/if}
    {/snippet}
  </ZeroQueryWrapper>
{/if}
