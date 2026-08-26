<script lang="ts">
  import '../app.css'
  // Imported for its module side effect only: `beforeinstallprompt` fires once, early in the page
  // load, and the surfaces that promote installing are all several navigations away. Registering
  // the listener from any of them would mean catching the event only by luck.
  import '$lib/state/install.svelte'
  import { registerServiceWorker } from '$lib/state/serviceWorker'
  import markdownDarkCssUrl from 'github-markdown-css/github-markdown-dark.css?url'
  import markdownLightCssUrl from 'github-markdown-css/github-markdown-light.css?url'
  import { onMount } from 'svelte'
  import { pwaAssetsHead } from 'virtual:pwa-assets/head'
  import { pwaInfo } from 'virtual:pwa-info'

  const { children } = $props()

  /**
   * The stylesheet every rendered body of markdown is styled by, and the one observer that swaps
   * it when the theme does.
   *
   * Here rather than in `Markdown.svelte`, which is mounted once per comment, per description and
   * per ascent note: a thread of thirty put thirty observers on `documentElement` and thirty
   * copies of the same `<link>` in `<head>`. The theme is a property of the document, so the
   * document is where it is watched.
   *
   * One element, owned by hand, rather than a `<svelte:head>` link over a piece of state. The
   * server cannot know the theme, so it would have to guess one, and hydration then leaves the
   * guess in `<head>` NEXT TO the corrected one: two stylesheets stating the same selectors, where
   * whichever the DOM happens to order last decides the colour. That put light-theme text
   * (#1f2328) on the dark surface of a comment thread. Created on mount, so it is always the last
   * markdown stylesheet in the document and always the right one.
   */
  onMount(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    document.head.append(link)

    const updateMarkdownTheme = () => {
      link.href = document.documentElement.classList.contains('dark') ? markdownDarkCssUrl : markdownLightCssUrl
    }

    updateMarkdownTheme()

    const observer = new MutationObserver(updateMarkdownTheme)
    observer.observe(document.documentElement, {
      attributeFilter: ['class'],
      attributes: true,
    })

    return () => {
      observer.disconnect()
      link.remove()
    }
  })

  // Frozen at build time, so a plain const rather than a signal that can never change.
  const webManifest = pwaInfo?.webManifest.linkTag ?? ''

  // Registers the service worker and reloads the page at the first navigation after a new one
  // takes over. Every decision behind that lives in the module, next to the code it governs.
  registerServiceWorker()
</script>

<!-- Site-wide, not (app)-only: Chromium fires `beforeinstallprompt` only on a document that links
     a manifest, and the invite screen that promotes installing is in the (landing) group. -->
<svelte:head>
  {#each pwaAssetsHead.links as link (link.href)}
    <link {...link} />
  {/each}

  <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted build-time PWA web manifest -->
  {@html webManifest}
</svelte:head>

{@render children()}
