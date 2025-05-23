<script lang="ts" module>
  export interface LayoutProps {
    children: Snippet
  }
</script>

<script lang="ts">
  import { dev } from '$app/environment'
  import { afterNavigate, invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.png'
  import { READ_PERMISSION } from '$lib/auth'
  import Breadcrumb from '$lib/components/Breadcrumb'
  import NavTiles from '$lib/components/NavTiles'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { ProgressBar } from '@prgm/sveltekit-progress-bar'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
  import { injectAnalytics } from '@vercel/analytics/sveltekit'
  import 'github-markdown-css/github-markdown-dark.css'
  import { onMount, type Snippet } from 'svelte'
  import { pwaAssetsHead } from 'virtual:pwa-assets/head'
  import { pwaInfo } from 'virtual:pwa-info'
  import '../../../app.css'
  import HeaderBar from './components/HeaderBar'

  injectAnalytics({ mode: dev ? 'development' : 'production' })

  let { children }: LayoutProps = $props()

  let webManifest = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '')

  onMount(() => {
    const value = page.data.supabase?.auth.onAuthStateChange((_, newSession) => {
      if (newSession?.expires_at !== page.data.session?.expires_at) {
        invalidateAll()
      }
    })

    return () => value?.data.subscription.unsubscribe()
  })

  afterNavigate(() => {
    if (page.url.hash.length === 0) {
      document.scrollingElement?.scrollTo(0, 0)
    }
  })

  $effect(() => {
    if (page.form != null) {
      document.scrollingElement?.scrollTo(0, 0)
    }
  })

  $effect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        console.log('posting message..')

        // Send data to service worker
        registration?.active?.postMessage({
          type: 'BLOCK_HISTORY_HASH',
          payload: page.data.blockHistoryHash,
        })
      })
    }
  })
</script>

<svelte:head>
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

  {#each pwaAssetsHead.links as link}
    <link {...link} />
  {/each}

  {@html webManifest}
</svelte:head>

<div>
  <ProgressBar class="text-secondary-500 !z-[100]" />

  <HeaderBar />

  <main
    class="relative p-2 md:p-4 {page.data.session?.user == null
      ? 'min-h-[calc(100vh-3rem)]'
      : 'min-h-[calc(100vh-3rem-4.515625rem)] md:ms-[6rem] md:min-h-[calc(100vh-3rem)]'}"
  >
    <Breadcrumb url={page.url} />

    {#if page.form?.error}
      <aside class="card preset-tonal-warning my-8 p-2 whitespace-pre-line md:p-4">
        <p>{page.form.error}</p>
      </aside>
    {/if}

    {@render children?.()}
  </main>

  {#if page.data.userPermissions?.includes(READ_PERMISSION)}
    <Navigation.Bar classes="md:hidden sticky bottom-0 z-50">
      <NavTiles userPermissions={page.data.userPermissions} />
    </Navigation.Bar>

    <Navigation.Rail base="hidden md:block fixed top-[48px] h-screen">
      {#snippet tiles()}
        <NavTiles userPermissions={page.data.userPermissions} />
      {/snippet}
    </Navigation.Rail>
  {/if}
</div>

{#await import('$lib/components/ReloadPrompt') then { default: ReloadPrompt }}
  <ReloadPrompt />
{/await}
