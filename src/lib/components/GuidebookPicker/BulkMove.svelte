<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { fly } from 'svelte/transition'
  import type { MoveKind } from './moves'
  import MoveSheet from './MoveSheet.svelte'
  import type { Selection } from './selection.svelte'

  // The bar under a list in select mode: moves what is ticked, then leaves select mode.
  interface Props {
    /** The parent the listed rows share: their area, or their block for routes. */
    from: null | number
    /** The list's rows. `topoLines` only for routes. */
    items: { id: number; title: string; topoLines?: number }[]
    kind: MoveKind
    regionFk: number
    selection: Selection
  }

  const { from, items, kind, regionFk, selection }: Props = $props()

  let moving = $state(false)
  // Mounted on first use, as in the action menus: the sheet runs queries.
  let used = $state(false)
  const picked = $derived(items.filter((item) => selection.has(item.id)))
  const topoLines = $derived(picked.reduce((sum, item) => sum + (item.topoLines ?? 0), 0))
</script>

{#if selection.active}
  <div
    class="bg-surface-50-950/90 sticky bottom-0 z-10 py-2 backdrop-blur"
    transition:fly={{ duration: motion(), y: 24 }}
  >
    <button
      class="btn preset-filled-primary-500 w-full active:scale-[0.97]"
      disabled={picked.length === 0}
      onclick={() => {
        used = true
        moving = true
      }}
      type="button"
    >
      {picked.length === 0 ? m.moves_moveTo() : m.moves_moveSelected({ count: picked.length })}
    </button>
  </div>
{/if}

{#if used}
  <MoveSheet
    bind:open={moving}
    {from}
    ids={picked.map((item) => item.id)}
    {kind}
    name={picked.length === 1 ? picked[0].title : undefined}
    onmoved={selection.done}
    {regionFk}
    {topoLines}
  />
{/if}
