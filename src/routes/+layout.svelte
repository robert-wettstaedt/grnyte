<script lang="ts">
  import { PUBLIC_APPLICATION_NAME, PUBLIC_ORIGIN } from '$env/static/public'
  import { m } from '$lib/paraglide/messages'
  import { getLocale, locales } from '$lib/paraglide/runtime'
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

  // og:locale wants language_TERRITORY, which a bare paraglide locale is not.
  const OG_LOCALES: Record<string, string> = { de: 'de_DE', en: 'en_US' }
  const ogLocale = $derived(OG_LOCALES[getLocale()] ?? OG_LOCALES.en)
  const alternateLocales = $derived(
    locales.filter((locale) => locale !== getLocale()).map((locale) => OG_LOCALES[locale] ?? locale),
  )

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

  <!-- Link-preview defaults for every public page. Per-page title, description and url live on the
       page, because Svelte renders both copies rather than deduping a repeated meta. -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={PUBLIC_APPLICATION_NAME} />
  <meta property="og:image" content="{PUBLIC_ORIGIN}/og.png" />
  <meta property="og:image:width" content="1280" />
  <meta property="og:image:height" content="640" />
  <meta property="og:image:alt" content={m.landing_ogImageAlt()} />
  <meta property="og:locale" content={ogLocale} />
  {#each alternateLocales as locale (locale)}
    <meta property="og:locale:alternate" content={locale} />
  {/each}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="{PUBLIC_ORIGIN}/og.png" />
  <meta name="twitter:image:alt" content={m.landing_ogImageAlt()} />
</svelte:head>

{@render children()}
