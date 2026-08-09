<script lang="ts">
  import '../app.css'
  // Imported for its module side effect only: `beforeinstallprompt` fires once, early in the page
  // load, and the surfaces that promote installing are all several navigations away. Registering
  // the listener from any of them would mean catching the event only by luck.
  import '$lib/state/install.svelte'
  import { pwaAssetsHead } from 'virtual:pwa-assets/head'
  import { pwaInfo } from 'virtual:pwa-info'

  const { children } = $props()

  // Frozen at build time, so a plain const rather than a signal that can never change.
  const webManifest = pwaInfo?.webManifest.linkTag ?? ''
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
