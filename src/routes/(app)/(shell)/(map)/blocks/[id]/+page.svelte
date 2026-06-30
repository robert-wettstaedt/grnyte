<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import ReferencedBy from '$lib/components/ReferencedBy/ReferencedBy.svelte'
  import { blockDetail, blockList } from '$lib/entities/block/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { sheetState } from '../../Modal/sheetState.svelte'
  import { toSheetNav } from '../../Modal/siblingNav'
  import BlockActions from './BlockActions.svelte'

  const global = getGlobalState()

  // Getter keeps the resource live across navigation between blocks — the query
  // re-targets as the param changes.
  const block = blockDetail(() => Number(page.params.id))

  // Siblings for prev/next nav (ordered by `order`). The immediate area is the last
  // entry of the containment chain. -1 while the block loads → empty result, no
  // all-blocks scan.
  const areaId = $derived(block.data?.areas.at(-1)?.id ?? -1)
  const siblings = blockList(() => ({ areaId }))

  const blockHref = (id: number) => resolve('/(app)/(shell)/(map)/blocks/[id]', { id: String(id) })

  // The Breadcrumb wants an area-shaped object; the block's `areas` is already the
  // full containment chain down to its immediate area, so wrap it as the trail.
  const breadcrumbArea = $derived(
    block.data == null
      ? null
      : {
          id: block.data.id,
          name: block.data.name,
          type: null,
          areas: block.data.areas,
          regionFk: block.data.regionFk,
        },
  )

  // The shared Modal renders its header from sheetState, so feed it the title
  // (name + Block tag), the area trail as the subtitle, and the prev/next nav as
  // floating controls pinned just above the sheet's top edge.
  $effect(() => {
    const data = block.data
    sheetState.title = title
    sheetState.subtitle = data != null && data.areas.length > 0 ? breadcrumb : null
    sheetState.nav = toSheetNav(siblings.data, data?.id, blockHref)
    return () => (sheetState.nav = null)
  })
</script>

<svelte:head>
  <title>{block.data?.name ?? m.common_block()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={block}>
  {#snippet ready(detail)}
    <div class="space-y-5">
      <BlockActions block={detail} />

      <p class="text-surface-600-400 py-8 text-center">{m.common_comingSoon()}</p>

      <ReferencedBy type="blocks" id={detail.id} />
    </div>
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.common_block()} />
  {/snippet}
</QueryState>

{#snippet breadcrumb()}
  {#if breadcrumbArea != null}
    <Breadcrumb area={breadcrumbArea} userRegions={global.userRegions} />
  {/if}
{/snippet}

{#snippet title()}
  {#if block.data != null}
    <div class="flex items-center gap-2">
      {block.data.name}

      <span
        class="bg-primary-500/20 text-primary-400 inline-flex h-5.25 items-center rounded-[7px] px-2 text-[11px] font-bold tracking-[0.02em]"
      >
        {m.common_block()}
      </span>
    </div>
  {/if}
{/snippet}
