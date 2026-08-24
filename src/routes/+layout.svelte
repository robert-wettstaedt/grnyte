<script lang="ts">
  import '../app.css'
  // Imported for its module side effect only: `beforeinstallprompt` fires once, early in the page
  // load, and the surfaces that promote installing are all several navigations away. Registering
  // the listener from any of them would mean catching the event only by luck.
  import '$lib/state/install.svelte'
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

  /**
   * Register the worker, which nothing did until now: everything `src/sw.ts` provides was inert
   * since the 2.0 rework - the offline shell, the derivative image cache, and push. The manifest
   * link below is what `beforeinstallprompt` needs, and is unrelated to the worker itself.
   *
   * Why it was never injected for us: `injectRegister` defaults to `auto`, which does nothing as
   * soon as a file imports one of the plugin's virtual modules - and this one imports two of them
   * for the manifest. So registering by hand is not a workaround here, it is the documented
   * SvelteKit path (vite-pwa-org.netlify.app/frameworks/sveltekit), which is also why
   * `svelte.config.js` sets `kit.serviceWorker.register: false`.
   *
   * The import is dynamic and inside `onMount` because this layout is server-rendered and the
   * virtual module is browser-only. `virtual:pwa-register` rather than the `/svelte` variant:
   * that one exists to drive an update-prompt UI and hands back stores, which there is nothing
   * here to render.
   *
   * `immediate: true` controls when registration is attempted, NOT which worker ends up in charge.
   * A new worker still installs into `waiting` and takes over only once every tab on the origin has
   * closed, which for a service worker fix means never for most people. `sw.ts` calls
   * `skipWaiting()` and `clients.claim()` itself so the newest worker always wins; its
   * `SKIP_WAITING` message handler stays for a prompt UI, if one is ever wanted.
   */
  onMount(async () => {
    if (pwaInfo == null) {
      return
    }

    const { registerSW } = await import('virtual:pwa-register')
    registerSW({ immediate: true })
  })
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
