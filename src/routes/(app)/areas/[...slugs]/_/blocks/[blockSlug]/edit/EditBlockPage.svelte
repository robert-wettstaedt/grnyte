<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import BlockFormFields from '$lib/components/BlockFormFields'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import { getBlockContext } from '$lib/contexts/block'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { deleteBlock, updateBlock } from './page.remote'

  const { block } = getBlockContext()

  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)
</script>

<svelte:head>
  <title>Edit {block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      Edit block
      <a class="anchor" href={basePath}>{block.name}</a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...updateBlock.enhance(enhanceForm())}>
  <BlockFormFields areaFk={block.areaFk} blockId={block.id} name={block.name} />

  <FormActionBar label="Update block" pending={updateBlock.pending} />
</form>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], block.regionFk)}
  <DangerZone name="block" onDelete={() => (block.id == null ? undefined : deleteBlock(block.id))} />
{/if}
