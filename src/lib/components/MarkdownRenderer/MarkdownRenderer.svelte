<script lang="ts">
  import { page } from '$app/state'
  import { queries } from '$lib/db/zero'
  import {
    convertMarkdownToHtmlSync,
    enrichMarkdownWithReferences,
    getReferences,
    type EncloseOptions,
    type MarkdownReference,
  } from '$lib/markdown'

  interface Props {
    className?: string
    encloseReferences?: EncloseOptions
    markdown: string
  }

  const { className, encloseReferences, markdown }: Props = $props()

  const markdownRefIds = $derived(getReferences(markdown))

  const areasResult = $derived(page.data.z.q(queries.listAreas(page.data, { areaId: markdownRefIds.areas })))

  const blocksResult = $derived(page.data.z.q(queries.listBlocks(page.data, { blockId: markdownRefIds.blocks })))

  const routesResult = $derived(page.data.z.q(queries.listRoutes(page.data, { routeId: markdownRefIds.routes })))

  const html = $derived.by(() => {
    const refs = [
      ...areasResult.current.map((item): MarkdownReference => ({ type: 'areas', id: item.id!, name: item.name })),
      ...blocksResult.current.map((item): MarkdownReference => ({ type: 'blocks', id: item.id!, name: item.name })),
      ...routesResult.current.map((item): MarkdownReference => ({ type: 'routes', id: item.id!, name: item.name })),
    ]

    const value = className?.split(' ').some((c) => c === 'short')
      ? markdown.replaceAll('\n', ' ').replaceAll('\r', '')
      : markdown

    const enrichedMarkdown = enrichMarkdownWithReferences(value, refs)
    const html = convertMarkdownToHtmlSync(enrichedMarkdown, encloseReferences)

    return html
  })
</script>

<div class="markdown-body {className}">
  {@html html}
</div>
