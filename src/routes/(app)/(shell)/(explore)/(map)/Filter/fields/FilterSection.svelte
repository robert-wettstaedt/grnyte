<script lang="ts">
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

<!-- No `name` on the <details>: that would make the sheet an exclusive accordion, and its job is
     stacking several constraints at once, so opening grade must not close tags. -->
<details class="group border-surface-200-800 border-b">
  <summary class="flex cursor-pointer list-none items-center justify-between gap-2 py-3 select-none">
    <span class="text-surface-600-400 text-xs font-bold tracking-wide uppercase">{label}</span>

    <span class="flex min-w-0 items-center gap-2">
      <span class={['truncate text-sm tabular-nums', active ? 'text-primary-500' : 'text-surface-600-400']}>
        {summary}
      </span>

      <span class="inline-flex shrink-0 transition-transform group-open:rotate-180">
        <Icon name="chevron-down" size={16} />
      </span>
    </span>
  </summary>

  <div class="pb-4">
    {@render children()}
  </div>
</details>
