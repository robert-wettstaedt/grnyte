<script lang="ts">
  import { resolve } from '$app/paths'
  import EmptyState, { EMPTY_CTA_PRIMARY, EMPTY_CTA_SECONDARY } from '$lib/components/EmptyState/EmptyState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { canAddArea, canAddBlock } from '$lib/entities/area/permissions'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()
  const global = getGlobalState()

  // A null-type area is undetermined: its first child fixes the type — a sub-area
  // makes it an 'area', a block makes it a 'crag'. With edit rights both adds are
  // allowed here, so the empty state is the fork; without them it's just a notice.
  // Per the design a block is the primary path (quickest way to actual routes).
  const canAddAreaHere = $derived(canAddArea(global.userRegions, area))
  const canAddBlockHere = $derived(canAddBlock(global.userRegions, area))
</script>

{#if canAddBlockHere || canAddAreaHere}
  <EmptyState
    motif="crag"
    title={m.areas_empty_title({ name: area.name })}
    body={m.areas_empty_body()}
    hint={canAddBlockHere && canAddAreaHere ? m.areas_empty_hint() : undefined}
  >
    {#if canAddBlockHere}
      <a class={EMPTY_CTA_PRIMARY} href={resolve('/(app)/areas/[id]/blocks/add', { id: String(area.id) })}>
        <Icon name="block" size={20} />
        {m.blocks_addBlock()}
      </a>
    {/if}

    {#if canAddAreaHere}
      <a class={EMPTY_CTA_SECONDARY} href={resolve('/(app)/areas/[id]/add', { id: String(area.id) })}>
        <Icon name="layers" size={20} />
        {m.areas_addSubArea()}
      </a>
    {/if}
  </EmptyState>
{:else}
  <div class="flex flex-col items-center px-6 py-10 text-center">
    <p class="text-surface-600-400 max-w-xs text-pretty">{m.queryState_empty()}</p>
  </div>
{/if}
