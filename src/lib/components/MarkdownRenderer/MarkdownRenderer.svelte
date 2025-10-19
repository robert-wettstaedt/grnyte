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
  import { Query } from 'zero-svelte'

  interface Props {
    className?: string
    encloseReferences?: EncloseOptions
    markdown: string
  }

  const { className, encloseReferences, markdown }: Props = $props()

  const markdownRefIds = $derived(getReferences(markdown))

  const areasQuery = $derived(queries.listAreas(page.data, { areaId: markdownRefIds.areas }))
  // svelte-ignore state_referenced_locally
  const areasResult = new Query(areasQuery)
  $effect(() => areasResult.updateQuery(areasQuery))

  const blocksQuery = $derived(queries.listBlocks(page.data, { blockId: markdownRefIds.blocks }))
  // svelte-ignore state_referenced_locally
  const blocksResult = new Query(blocksQuery)
  $effect(() => blocksResult.updateQuery(blocksQuery))

  const routesQuery = $derived(queries.listRoutes(page.data, { routeId: markdownRefIds.routes }))
  // svelte-ignore state_referenced_locally
  const routesResult = new Query(routesQuery)
  $effect(() => routesResult.updateQuery(routesQuery))

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
