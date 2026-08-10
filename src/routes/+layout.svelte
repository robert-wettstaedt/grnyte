<script lang="ts">
  import '../app.css'
  // Imported for its module side effect only: `beforeinstallprompt` fires once, early in the page
  // load, and the surfaces that promote installing are all several navigations away. Registering
  // the listener from any of them would mean catching the event only by luck.
  import '$lib/state/install.svelte'
  import { onMount } from 'svelte'
  import { pwaAssetsHead } from 'virtual:pwa-assets/head'
  import { pwaInfo } from 'virtual:pwa-info'

  const { children } = $props()

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
   * here to render. `immediate: true` takes the new worker on the next load, which is the right
   * trade for an app whose pages all render from the same local replica; `sw.ts`'s `SKIP_WAITING`
   * handler is what a prompt would drive, if one is ever wanted.
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
