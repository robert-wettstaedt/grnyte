<script lang="ts" generics="T">
  import { m } from '$lib/paraglide/messages'
  import type { Snippet } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import { slide } from 'svelte/transition'

  // A list clamped to `limit` rows behind a show-more. The rows past the limit are their own
  // {#if} so the press slides them open while the button it replaces slides shut.
  interface Props {
    items: T[]
    /** Row identity for the keyed each. */
    key: (item: T) => PropertyKey
    /** How many rows to show before "show more". */
    limit?: number
    row: Snippet<[T]>
  }

  const { items, key, limit = 6, row }: Props = $props()

  let expanded = $state(false)

  const shown = $derived(items.slice(0, limit))
  const rest = $derived(items.slice(limit))

  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current ? 0 : 150)
</script>

<div class="flex flex-col gap-1.5">
  {#each shown as item (key(item))}
    {@render row(item)}
  {/each}

  {#if expanded && rest.length > 0}
    <div class="flex flex-col gap-1.5" transition:slide={{ duration }}>
      {#each rest as item (key(item))}
        {@render row(item)}
      {/each}
    </div>
  {/if}

  {#if rest.length > 0 && !expanded}
    <button
      class="btn preset-tonal-surface mt-1.5 w-full"
      onclick={() => (expanded = true)}
      transition:slide={{ duration }}
      type="button"
    >
      {m.common_showMore()}
    </button>
  {/if}
</div>
