<script lang="ts">
  import { getGlobalState } from '$lib/state/global.svelte'
  import markdownDarkCssUrl from 'github-markdown-css/github-markdown-dark.css?url'
  import markdownLightCssUrl from 'github-markdown-css/github-markdown-light.css?url'
  import { onMount } from 'svelte'
  import { convertMarkdownToHtmlSync } from './lib'
  import { markdownReferences } from './lib/references.svelte'
  import { type EncloseOptions, enrichMarkdownWithReferences, getReferences } from './lib/remark-references'

  interface Props {
    className?: string
    disableLinks?: boolean
    encloseReferences?: EncloseOptions
    markdown: string
  }

  const { className, disableLinks = false, encloseReferences, markdown }: Props = $props()

  let markdownCssHref = $state(markdownLightCssUrl)

  onMount(() => {
    const updateMarkdownTheme = () => {
      markdownCssHref = document.documentElement.classList.contains('dark') ? markdownDarkCssUrl : markdownLightCssUrl
    }

    updateMarkdownTheme()

    const observer = new MutationObserver(updateMarkdownTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => {
      observer.disconnect()
    }
  })

  const global = getGlobalState()

  const markdownRefIds = $derived(getReferences(markdown))
  const references = markdownReferences(() => markdownRefIds)

  const html = $derived.by(() => {
    const value = className?.split(' ').some((c) => c === 'short')
      ? markdown.replaceAll('\n', ' ').replaceAll('\r', '')
      : markdown

    const enrichedMarkdown = enrichMarkdownWithReferences(value, references.data)
    return convertMarkdownToHtmlSync(enrichedMarkdown, global.grades, encloseReferences, disableLinks)
  })
</script>

<svelte:head>
  <link rel="stylesheet" href={markdownCssHref} />
</svelte:head>

<div class="markdown-body {className}">
  <!-- `html` is produced solely by our unified pipeline (see ./lib): user input
       is parsed as markdown and raw HTML is dropped (no rehype-raw), so the
       output contains only the elements we emit. Safe to render. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html html}
</div>
