<script lang="ts">
  import type { Snippet } from 'svelte'

  // A titled group on a settings screen. The card the rows sit in stays at the call site: some
  // sections render it conditionally, and some render it inside a QueryState instead.
  interface Props {
    /** Rendered opposite the title, for a section that carries a status (e.g. seats used). */
    aside?: Snippet
    children: Snippet
    title: string
  }

  const { aside, children, title }: Props = $props()
</script>

<section class="space-y-2">
  <header class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
    <h2 class="text-surface-600-400 text-xs font-semibold tracking-wide uppercase">{title}</h2>
    {@render aside?.()}
  </header>

  {@render children()}
</section>
