<script lang="ts">
  import { getGlobalState } from '$lib/state/global.svelte'
  import { convertMarkdownToHtmlSync } from './lib'
  import { markdownReferences } from './lib/references.svelte'
  import { enrichMarkdownWithReferences, getReferences, type EncloseOptions } from './lib/remark-references'

  interface Props {
    className?: string
    disableLinks?: boolean
    encloseReferences?: EncloseOptions
    markdown: string
  }

  const { className, disableLinks = false, encloseReferences, markdown }: Props = $props()

  // The github-markdown-css stylesheet, and the observer that swaps it with the theme, live in the
  // root layout: they are one thing for the document, not one per rendered body of text. A thread
  // of thirty comments used to install thirty MutationObservers on `documentElement` and append
  // thirty copies of the same `<link>` to `<head>`, and every theme toggle then ran thirty
  // callbacks.

  const global = getGlobalState()

  const markdownRefIds = $derived(getReferences(markdown))
  const references = markdownReferences(() => markdownRefIds)
  const hasReferences = $derived(Object.values(markdownRefIds).some((ids) => ids.length > 0))

  const html = $derived.by(() => {
    const value = className?.split(' ').some((c) => c === 'short')
      ? markdown.replaceAll('\n', ' ').replaceAll('\r', '')
      : markdown

    // Reference-free markdown (the common case) skips the enrich pass — and
    // with it the lazily-evaluated Zero resources behind `references.data`, so
    // it renders without a Zero client (Storybook).
    const enrichedMarkdown = hasReferences ? enrichMarkdownWithReferences(value, references.data) : value
    return convertMarkdownToHtmlSync(enrichedMarkdown, global.grades, encloseReferences, disableLinks)
  })
</script>

<div class="markdown-body {className}">
  <!-- `html` is produced solely by our unified pipeline (see ./lib): user input
       is parsed as markdown and raw HTML is dropped (no rehype-raw), so the
       output contains only the elements we emit. Safe to render. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html html}
</div>

<style>
  /* Tombstone for a reference whose target was deleted (see remark-references):
     muted, non-interactive text in place of the dead link. `:global` because the
     markdown HTML is injected via {@html}. */
  :global(.markdown-body .reference-missing) {
    font-style: italic;
    opacity: 0.6;
  }
</style>
