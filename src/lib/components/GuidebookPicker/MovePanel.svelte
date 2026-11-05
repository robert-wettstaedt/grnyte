<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { fly } from 'svelte/transition'
  import GuidebookPicker, { type PickerItem } from './GuidebookPicker.svelte'

  // What a move sheet shows, from plain values: `MoveSheet` owns the data and the flow.
  interface Props {
    emptyLabel: string
    items: PickerItem[]
    onjump: (id: null | number) => void
    onopen: (item: PickerItem) => void
    onpick: (item: PickerItem) => void
    /** The level being browsed, region first; every crumb but the last jumps back to it. */
    path: { id: null | number; label: string }[]
    placeholder: string
    query?: string
    settled: boolean
    /** Set once the move needs confirming because it would remove topo lines; the sheet footer confirms. */
    warning?: string
  }

  let {
    emptyLabel,
    items,
    onjump,
    onopen,
    onpick,
    path,
    placeholder,
    query = $bindable(''),
    settled,
    warning,
  }: Props = $props()
</script>

{#if warning == null}
  <div in:fly={{ duration: motion(), x: -24 }}>
    <!-- Keyed by level: the picker keeps rows in place within one list, never across two. -->
    {#key path.at(-1)?.id}
      <GuidebookPicker bind:query {emptyLabel} fill {items} {onopen} {onpick} {placeholder} {settled}>
        {#snippet header()}
          {#if query.trim() === ''}
            <nav aria-label={m.moves_where()} class="flex flex-wrap items-center gap-x-1 gap-y-0.5 px-1 text-sm">
              {#each path as crumb, i (crumb.id)}
                {#if i > 0}
                  <Icon name="chevron-right" size={14} class="text-surface-500 shrink-0" />
                {/if}
                {#if i < path.length - 1}
                  <button
                    class="text-primary-600-400 font-semibold active:scale-[0.97]"
                    onclick={() => onjump(crumb.id)}
                    type="button"
                  >
                    {crumb.label}
                  </button>
                {:else}
                  <span aria-current="location" class="font-semibold">{crumb.label}</span>
                {/if}
              {/each}
            </nav>
          {/if}
        {/snippet}
      </GuidebookPicker>
    {/key}
  </div>
{:else}
  <p class="py-2 text-sm" in:fly={{ duration: motion(), x: 24 }}>{warning}</p>
{/if}
