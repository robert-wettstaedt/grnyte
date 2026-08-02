<script lang="ts">
  import { resolve } from '$app/paths'
  import EmptyState, { EMPTY_CTA_PRIMARY } from '$lib/components/EmptyState/EmptyState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { canAddRoute } from '$lib/entities/route/permissions'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  // The last link of the chain, and the only one that was missing: a block with no routes is the
  // blankest screen in the app. One CTA on purpose - the other thing offered here is the topo
  // editor, and a topo has nothing to draw a line for until a route exists.
  interface Props {
    block: BlockDetail
  }

  const { block }: Props = $props()
  const global = getGlobalState()

  const canAdd = $derived(canAddRoute(global.userRegions, block))
</script>

{#if canAdd}
  <EmptyState motif="routes" title={m.blocks_empty_title({ name: block.name })} body={m.blocks_empty_body()}>
    <a class={EMPTY_CTA_PRIMARY} href={resolve('/(app)/blocks/[id]/routes/add', { id: String(block.id) })}>
      <Icon name="route" size={20} />
      {m.blocks_empty_cta()}
    </a>
  </EmptyState>
{:else}
  <div class="flex flex-col items-center px-6 py-10 text-center">
    <p class="text-surface-600-400 max-w-xs text-pretty">{m.queryState_empty()}</p>
  </div>
{/if}
