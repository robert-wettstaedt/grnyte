<script lang="ts">
  import { page } from '$app/state'
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

  const areasQuery = $derived(
    page.data.z.current.query.areas.where(({ cmp, or }) => or(...markdownRefIds.areas.map((id) => cmp('id', id)))),
  )
  // svelte-ignore state_referenced_locally
  const areasResult = new Query(areasQuery)
  $effect(() => areasResult.updateQuery(areasQuery))

  const blocksQuery = $derived(
    page.data.z.current.query.blocks.where(({ cmp, or }) => or(...markdownRefIds.blocks.map((id) => cmp('id', id)))),
  )
  // svelte-ignore state_referenced_locally
  const blocksResult = new Query(blocksQuery)
  $effect(() => blocksResult.updateQuery(blocksQuery))

  const routesQuery = $derived(
    page.data.z.current.query.routes.where(({ cmp, or }) => or(...markdownRefIds.routes.map((id) => cmp('id', id)))),
  )
  // svelte-ignore state_referenced_locally
  const routesResult = new Query(routesQuery)
  $effect(() => routesResult.updateQuery(routesQuery))

  const markdownRefs = $derived([
    ...areasResult.current.map((item): MarkdownReference => ({ type: 'areas', id: item.id!, name: item.name })),
    ...blocksResult.current.map((item): MarkdownReference => ({ type: 'blocks', id: item.id!, name: item.name })),
    ...routesResult.current.map((item): MarkdownReference => ({ type: 'routes', id: item.id!, name: item.name })),
  ])

  const enrichedMarkdown = $derived(enrichMarkdownWithReferences(markdown, markdownRefs))
  const html = $derived(convertMarkdownToHtmlSync(enrichedMarkdown, encloseReferences))
</script>

<div class="markdown-body {className}">
  {@html html}
</div>
