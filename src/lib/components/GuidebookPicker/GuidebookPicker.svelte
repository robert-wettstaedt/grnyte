<script lang="ts" module>
  /** One choice. `reason` disables it and says why, `dimmed` without a word where `badge` already says
   *  it; `openable` drills into it instead of picking it; `info` only shows what is there. */
  export interface PickerItem {
    /** The row's kind, in the chip the page headers use (Area, Sector). */
    badge?: string
    crumbs?: string[]
    dimmed?: boolean
    id: number
    info?: boolean
    /** Short trailing text, a distance for one. */
    meta?: string
    openable?: boolean
    reason?: string
    title: string
  }
</script>

<script lang="ts">
  import Row from '$lib/components/EntityRow/Row.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    /** Shown when nothing matches, and only once the rows are known to be whole. */
    emptyLabel: string
    /** Grow with the surface it sits in instead of scrolling in a fixed-height box. */
    fill?: boolean
    /** Above the list: a way up, or an action on the level being browsed. */
    header?: Snippet
    items: PickerItem[]
    onopen?: (item: PickerItem) => void
    onpick: (item: PickerItem) => void
    /** Listed first, under their own heading, ahead of whatever the search finds. */
    pinned?: PickerItem[]
    pinnedLabel?: string
    placeholder: string
    query?: string
    /** Heads the unpinned rows, only while both groups have rows: alone, the tail is the list. */
    restLabel?: string
    /** Whether `items` is whole; until then an empty list says nothing. */
    settled: boolean
  }

  let {
    emptyLabel,
    fill = false,
    header,
    items,
    onopen,
    onpick,
    pinned = [],
    pinnedLabel,
    placeholder,
    query = $bindable(''),
    restLabel,
    settled,
  }: Props = $props()

  // Rows already shown keep their place while more sync in, so a tap never lands on one that moved.
  // Plain bookkeeping read while rendering, never a reason to render again.
  let placed: number[] = []
  let placedFor: string | undefined
  const ordered = $derived.by(() => {
    if (placedFor !== query) {
      placed = []
      placedFor = query
    }
    const all = [...pinned, ...items]
    const byId = new Map(all.map((item) => [item.id, item]))
    for (const item of all) if (!placed.includes(item.id)) placed.push(item.id)
    return placed.flatMap((id) => byId.get(id) ?? [])
  })
  const pinnedIds = $derived(new Set(pinned.map((item) => item.id)))
  const pinnedRows = $derived(ordered.filter((item) => pinnedIds.has(item.id)))
  const rest = $derived(ordered.filter((item) => !pinnedIds.has(item.id)))
</script>

{#snippet badge(label: string)}
  <span
    class="bg-primary-500/20 text-primary-700-300 inline-flex h-5.25 shrink-0 items-center rounded-[7px] px-2 text-[11px] font-bold tracking-[0.02em]"
  >
    {label}
  </span>
{/snippet}

{#snippet row(item: PickerItem)}
  {@const disabled = item.reason != null || item.dimmed}
  <div class={[disabled && 'opacity-50']} aria-disabled={disabled || undefined}>
    <Row
      crumbs={item.crumbs}
      description={item.reason}
      onclick={disabled || item.info
        ? undefined
        : () => (item.openable && onopen != null ? onopen(item) : onpick(item))}
      title={item.title}
      variant="option"
    >
      {#snippet rightContent()}
        {#if item.badge != null}{@render badge(item.badge)}{/if}
        {#if item.meta != null}
          <span class="text-surface-500 shrink-0 text-[11px] font-semibold tabular-nums">{item.meta}</span>
        {/if}
        {#if item.openable}
          <Icon name="chevron-right" size={16} class="text-surface-500 shrink-0" />
        {/if}
      {/snippet}
    </Row>
  </div>
{/snippet}

<div class="flex flex-col gap-2 py-2">
  <input
    bind:value={query}
    class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-4 py-2.5 text-base focus:ring-0 focus:outline-none"
    {placeholder}
    type="search"
  />
  {@render header?.()}
  <div class={['flex flex-col', !fill && 'max-h-72 overflow-y-auto']} role="list">
    {#if pinnedRows.length > 0}
      {#if pinnedLabel != null}
        <h3 class="text-surface-500 px-1 pt-1 pb-1 text-xs font-bold tracking-wider uppercase">{pinnedLabel}</h3>
      {/if}
      {#each pinnedRows as item (item.id)}
        {@render row(item)}
      {/each}
    {/if}
    {#if restLabel != null && pinnedRows.length > 0 && rest.some((item) => item.reason == null)}
      <h3 class="text-surface-500 px-1 pt-3 pb-1 text-xs font-bold tracking-wider uppercase">{restLabel}</h3>
    {/if}
    {#each rest as item (item.id)}
      {@render row(item)}
    {/each}
    {#if pinnedRows.length === 0 && rest.length === 0 && settled}
      <span class="text-surface-600-400 px-3 py-2 text-sm">{emptyLabel}</span>
    {/if}
  </div>
</div>
