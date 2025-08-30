<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import { pageState } from '$lib/components/Layout'
  import { getAreaContext } from '$lib/contexts/area'
  import { convertAreaSlug } from '$lib/helper'

  let { canAddArea } = $derived(convertAreaSlug())

  const { area } = getAreaContext()
</script>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
  <a class="btn btn-sm preset-outlined-primary-500" href="{page.url.pathname}/edit">
    <i class="fa-solid fa-pen w-4"></i>Edit area details
  </a>

  {#if area.type !== 'sector' && canAddArea}
    <a class="btn btn-sm preset-outlined-primary-500" href="{page.url.pathname}/add">
      <i class="fa-solid fa-plus w-4"></i>Add area
    </a>
  {/if}

  {#if area.type === 'sector'}
    <a class="btn btn-sm preset-outlined-primary-500" href="{page.url.pathname}/_/blocks/add">
      <i class="fa-solid fa-plus w-4"></i>Add block
    </a>
  {/if}

  {#if area.type !== 'area'}
    <a class="btn btn-sm preset-outlined-primary-500" href="{page.url.pathname}/edit-parking-location">
      <i class="fa-solid fa-parking w-4"></i>Add parking location
    </a>
  {/if}
{/if}

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk)}
  {#if area.type === 'sector'}
    <a class="btn btn-sm preset-outlined-primary-500" href="{page.url.pathname}/export">
      <i class="fa-solid fa-file-export w-4"></i>Export PDF
    </a>
  {/if}

  <a class="btn btn-sm preset-outlined-primary-500" href="{page.url.pathname}/sync-external-resources">
    <i class="fa-solid fa-sync w-4"></i>Sync external resources
  </a>
{/if}
