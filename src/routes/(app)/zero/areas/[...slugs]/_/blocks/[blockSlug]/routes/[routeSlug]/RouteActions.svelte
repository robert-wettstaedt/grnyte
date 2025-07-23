<script lang="ts">
  import { enhance } from '$app/forms'
  import { invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import type { RowWithRelations, Schema } from '$lib/db/zero'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    block: RowWithRelations<'blocks', Schema, { topos: true }>
    blockPath: string
  }

  const { block, blockPath }: Props = $props()

  let syncing = $state(false)
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
  <form
    class="leading-none"
    method="POST"
    action="?/syncExternalResources"
    use:enhance={({}) => {
      syncing = true

      return ({ result }) => {
        syncing = false

        if (result.type === 'success') {
          invalidateAll()
        }
      }
    }}
  >
    <button class="btn btn-sm preset-outlined-primary-500" disabled={syncing} type="submit">
      {#if syncing}
        <span class="me-2">
          <ProgressRing size="size-sm" value={null} />
        </span>
      {:else}
        <i class="fa-solid fa-sync"></i>
      {/if}

      Sync external resources
    </button>
  </form>
{/if}

<!-- {#if route.externalResources?.externalResource8a?.url != null}
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
{/if}-->
