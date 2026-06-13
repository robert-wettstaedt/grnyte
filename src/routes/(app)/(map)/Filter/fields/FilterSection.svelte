<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    label: string
    /** Short text shown on the right of the header, summarising the current value. */
    summary: string
    /** Whether this filter currently constrains results; highlights the summary. */
    active?: boolean
    children: Snippet
  }

  let { label, summary, active = false, children }: Props = $props()

  let open = $state(false)
</script>

<div class="border-surface-200-800 border-b">
  <button
    type="button"
    class="flex w-full items-center justify-between gap-2 py-3 text-left"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="text-sm font-medium">{label}</span>

    <span class="flex min-w-0 items-center gap-2">
      <span class={['truncate text-sm tabular-nums', active ? 'text-primary-500' : 'text-surface-600-400']}>
        {summary}
      </span>

      <span class={['inline-flex shrink-0 transition-transform', open && 'rotate-180']}>
        <Icon name="chevron-down" size={16} />
      </span>
    </span>
  </button>

  {#if open}
    <div class="pb-4">
      {@render children()}
    </div>
  {/if}
</div>
