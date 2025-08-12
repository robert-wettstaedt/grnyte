<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import type { RowWithRelations } from '$lib/db/zero'

  interface Props {
    block: RowWithRelations<'blocks', { topos: true }>
  }

  const { block }: Props = $props()
</script>

{#if checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
  <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/edit`}>
    <i class="fa-solid fa-pen w-4"></i>Edit block details
  </a>

  <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/routes/add`}>
    <i class="fa-solid fa-plus w-4"></i>Add route
  </a>

  <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/topos/add`}>
    <i class="fa-solid fa-file-arrow-up w-4"></i>Upload topo image
  </a>

  {#if block.topos.length > 0}
    <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/topos/draw`}>
      <i class="fa-solid fa-file-pen w-4"></i>Edit topo
    </a>
  {/if}

  <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/edit-location`}>
    <i class="fa-solid fa-location-dot w-4"></i>Edit geolocation
  </a>
{/if}

{#if block.topos.length > 0}
  <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/export`}>
    <i class="fa-solid fa-file-export w-4"></i>Export block preview
  </a>
{/if}
