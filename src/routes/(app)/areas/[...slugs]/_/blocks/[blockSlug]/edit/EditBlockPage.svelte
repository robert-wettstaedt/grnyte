<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import BlockFormFields from '$lib/components/BlockFormFields'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm, type EnhanceState } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { deleteBlock, updateBlock } from './page.remote'
  import { goto } from '$app/navigation'

  interface Props {
    block: Row<'blocks'>
  }

  let { block }: Props = $props()
  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)
  let state = $state<EnhanceState>({})
</script>

<svelte:head>
  <title>Edit {block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit block</span>
    <a class="anchor" href={basePath}>{block.name}</a>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...updateBlock.enhance(enhanceForm(state))}>
  <BlockFormFields areaFk={block.areaFk} blockId={block.id} name={block.name} />

  <FormActionBar {state} label="Update block" />
</form>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], block.regionFk)}
  <DangerZone name="block" onDelete={() => (block.id == null ? undefined : deleteBlock(block.id))} />
{/if}
