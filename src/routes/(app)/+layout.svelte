<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import NavRail from '$lib/components/AppNav/NavRail.svelte'
  import TabBar from '$lib/components/AppNav/TabBar.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { setGlobalState } from '$lib/state/global.svelte'
  import markdownLightCssUrl from 'github-markdown-css/github-markdown-light.css?url'
  import { pwaAssetsHead } from 'virtual:pwa-assets/head'
  import { pwaInfo } from 'virtual:pwa-info'
  import '../../app.css'

  const { children } = $props()

  const globalState = setGlobalState()

  // Full-screen editor routes (e.g. /areas/*) opt out of the nav chrome via
  // their layout data, so a focused task isn't framed by the rail and tab bar.
  const fullscreen = $derived(page.data.fullscreen === true)

  let webManifest = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '')
  let markdownCssHref = $state(markdownLightCssUrl)
</script>

<svelte:head>
  <link rel="stylesheet" href={markdownCssHref} />
  <title>{PUBLIC_APPLICATION_NAME}</title>
  <meta name="description" content="Secure boulder topo and session tracker." />
  <meta property="og:title" content={PUBLIC_APPLICATION_NAME} />
  <meta property="og:description" content="Secure boulder topo and session tracker." />
  <meta property="og:image" content={Logo} />
  <meta property="og:url" content={page.url.toString()} />
  <meta property="og:type" content="website" />

  {#if pwaAssetsHead.themeColor}
    <meta name="theme-color" content={pwaAssetsHead.themeColor.content} />
  {/if}

  {#each pwaAssetsHead.links as link (link.href)}
    <link {...link} />
  {/each}

  <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted build-time PWA web manifest -->
  {@html webManifest}
</svelte:head>

{#if globalState?.isLoading}
  <LoadingIndicator class="fixed flex h-full w-full items-center justify-center" size={20} />
{:else}
  <div class="fixed inset-0 flex">
    <main class="relative min-w-0 flex-1 overflow-y-auto">
      {@render children()}
    </main>

    {#if !fullscreen}
      <NavRail />
      <TabBar />
    {/if}
  </div>
{/if}
