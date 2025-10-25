<script lang="ts">
  import { page } from '$app/state'
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

  const areasResult = $derived(
    page.data.z.q(
      page.data.z.query.areas.where(({ cmp, or }) => or(...markdownRefIds.areas.map((id) => cmp('id', id)))),
    ),
  )

  const blocksResult = $derived(
    page.data.z.q(
      page.data.z.query.blocks.where(({ cmp, or }) => or(...markdownRefIds.blocks.map((id) => cmp('id', id)))),
    ),
  )

  const routesResult = $derived(
    page.data.z.q(
      page.data.z.query.routes.where(({ cmp, or }) => or(...markdownRefIds.routes.map((id) => cmp('id', id)))),
    ),
  )

  const markdownRefs = $derived([
    ...areasResult.data.map((item): MarkdownReference => ({ type: 'areas', id: item.id!, name: item.name })),
    ...blocksResult.data.map((item): MarkdownReference => ({ type: 'blocks', id: item.id!, name: item.name })),
    ...routesResult.data.map((item): MarkdownReference => ({ type: 'routes', id: item.id!, name: item.name })),
  ])

  const value = $derived(
    className?.split(' ').some((c) => c === 'short') ? markdown.replaceAll('\n', ' ').replaceAll('\r', '') : markdown,
  )
  const enrichedMarkdown = $derived(enrichMarkdownWithReferences(value, markdownRefs))
  const html = $derived(convertMarkdownToHtmlSync(enrichedMarkdown, encloseReferences))

  $inspect({ markdown, value })
</script>

<div class="markdown-body {className}">
  {@html html}
</div>
