<script lang="ts">
  import { getGlobalState } from '$lib/state/global.svelte'
  import { convertMarkdownToHtmlSync } from './lib'
  import { markdownReferences } from './lib/references.svelte'
  import { type EncloseOptions, enrichMarkdownWithReferences, getReferences } from './lib/remark-references'

  interface Props {
    className?: string
    encloseReferences?: EncloseOptions
    markdown: string
  }

  const { className, encloseReferences, markdown }: Props = $props()

  const global = getGlobalState()

  const markdownRefIds = $derived(getReferences(markdown))
  const references = markdownReferences(() => markdownRefIds)

  const html = $derived.by(() => {
    const value = className?.split(' ').some((c) => c === 'short')
      ? markdown.replaceAll('\n', ' ').replaceAll('\r', '')
      : markdown

    const enrichedMarkdown = enrichMarkdownWithReferences(value, references.data)
    return convertMarkdownToHtmlSync(enrichedMarkdown, global.grades, encloseReferences)
  })
</script>

<div class="markdown-body {className}">
  {@html html}
</div>
