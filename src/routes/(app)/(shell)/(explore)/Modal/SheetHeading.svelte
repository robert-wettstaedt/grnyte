<!-- Shared sheet header content: sheetState's headerLeft plus the subtitle/title column, in the
     order every sheet header puts them. `wrapper` lets a host own the column's element. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { sheetState } from './sheetState.svelte'

  /** Wraps the title column when the host needs its own element there (the Dialog's `Dialog.Title`). */
  let { wrapper }: { wrapper?: Snippet<[Snippet]> } = $props()
</script>

{#snippet column()}
  {#if typeof sheetState.subtitle === 'string'}
    <span class="text-surface-600-400 shrink-0 text-xs">{sheetState.subtitle}</span>
  {:else if sheetState.subtitle != null}
    {@render sheetState.subtitle()}
  {/if}

  <!-- Wraps rather than truncates: the hosts disagreed before this was shared (the panel truncated,
       both modals did not), and the only string title is the search query, which is worth reading in
       full. Entity names come through as a snippet and are unaffected either way.
       `wrap-anywhere` because a query can be one unbroken token, which has no break opportunity and
       would otherwise run past the header (and pan the mobile sheet, whose overflow-x is auto). -->
  {#if typeof sheetState.title === 'string'}
    <span class="text-lg wrap-anywhere">{sheetState.title}</span>
  {:else if sheetState.title != null}
    {@render sheetState.title()}
  {/if}
{/snippet}

{#if sheetState.headerLeft}
  {@render sheetState.headerLeft()}
{/if}

{#if wrapper}
  {@render wrapper(column)}
{:else}
  <div class="flex min-w-0 flex-col">
    {@render column()}
  </div>
{/if}
