<script lang="ts">
  import Disclosure from '$lib/components/Disclosure/Disclosure.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    /** Whether this filter currently constrains results; highlights the summary. */
    active?: boolean
    children: Snippet
    label: string
    /** Short text shown on the right of the header, summarising the current value. */
    summary: string
  }

  let { active = false, children, label, summary }: Props = $props()
</script>

<!-- Passed by name, not declared inline: this component already has a `summary` prop of its own. -->
{#snippet header(open: boolean)}
  <span class="text-surface-600-400 text-xs font-bold tracking-wide uppercase">{label}</span>

  <span class="flex min-w-0 items-center gap-2">
    <span class={['truncate text-sm tabular-nums', active ? 'text-primary-500' : 'text-surface-600-400']}>
      {summary}
    </span>

    <span class={['inline-flex shrink-0 transition-transform', open && 'rotate-180']}>
      <Icon name="chevron-down" size={16} />
    </span>
  </span>
{/snippet}

<!-- Sections are independent, not an accordion: the sheet's job is stacking several constraints at
     once, so opening grade must not close tags. -->
<Disclosure
  class="border-surface-200-800 border-b"
  panelClass="pb-4"
  summary={header}
  summaryClass="flex w-full items-center justify-between gap-2 py-3"
>
  {@render children()}
</Disclosure>
