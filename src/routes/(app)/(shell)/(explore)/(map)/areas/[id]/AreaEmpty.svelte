<script lang="ts" module>
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { canAddArea, canAddBlock } from '$lib/entities/area/permissions'
  import type { UserRegion } from '$lib/entities/region/dto'

  /** Whether this empty state offers a way out of it. With an add available it is the answer to
   *  the tap, so the page leads with it; without one it is only a notice and stays down in the
   *  slot the missing content would have filled. */
  export const areaEmptyIsActionable = (userRegions: UserRegion[], area: AreaDetail) =>
    canAddBlock(userRegions, area) || canAddArea(userRegions, area)
</script>

<script lang="ts">
  import { resolve } from '$app/paths'
  import EmptyState, {
    EMPTY_CHOICE_PRIMARY,
    EMPTY_CHOICE_SECONDARY,
  } from '$lib/components/EmptyState/EmptyState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()
  const global = getGlobalState()

  // A null-type area is undetermined: its first child fixes the type. A sub-area
  // makes it an 'area', a block makes it a 'sector'. With edit rights both adds are
  // allowed here, so the empty state is the fork; without them it's only a notice.
  // Per the design a block is the primary path (quickest way to actual routes),
  // and each option states what it costs you, so no paragraph has to.
  const canAddAreaHere = $derived(canAddArea(global.userRegions, area))
  const canAddBlockHere = $derived(canAddBlock(global.userRegions, area))
</script>

{#if canAddBlockHere || canAddAreaHere}
  <EmptyState motif="sector" title={m.areas_empty_title({ name: area.name })}>
    {#if canAddBlockHere}
      <a class={EMPTY_CHOICE_PRIMARY} href={resolve('/(app)/areas/[id]/blocks/add', { id: String(area.id) })}>
        <Icon name="block" size={20} class="shrink-0" />
        <span class="min-w-0">
          <span class="block text-base font-bold">{m.blocks_addBlock()}</span>
          <!-- opacity-90 is the step down that still clears AA on the filled preset at 12px. -->
          <span class="block text-xs font-normal opacity-90">{m.areas_empty_blockHint()}</span>
        </span>
      </a>
    {/if}

    {#if canAddAreaHere}
      <a class={EMPTY_CHOICE_SECONDARY} href={resolve('/(app)/areas/[id]/add', { id: String(area.id) })}>
        <Icon name="layers" size={20} class="shrink-0" />
        <span class="min-w-0">
          <span class="block text-base font-semibold">{m.areas_addSubArea()}</span>
          <span class="text-surface-600-400 block text-xs font-normal">{m.areas_empty_areaHint()}</span>
        </span>
      </a>
    {/if}
  </EmptyState>
{:else}
  <div class="flex flex-col items-center px-6 py-10 text-center">
    <p class="text-surface-600-400 max-w-xs text-pretty">{m.queryState_empty()}</p>
  </div>
{/if}
