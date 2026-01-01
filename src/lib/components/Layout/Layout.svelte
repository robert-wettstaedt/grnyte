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
  import Logo from '$lib/assets/logo.svg'
  import Breadcrumb from '$lib/components/Breadcrumb'
  import Error from '$lib/components/Error'
  import NavTiles from '$lib/components/NavTiles'
  import { toaster } from '$lib/components/Toaster'
  import { convertException } from '$lib/errors'
  import { formState } from '$lib/forms/enhance.svelte'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { ProgressBar } from '@prgm/sveltekit-progress-bar'
  import { Navigation, Toast } from '@skeletonlabs/skeleton-svelte'
  import 'github-markdown-css/github-markdown-dark.css'
  import { onMount, type Snippet } from 'svelte'
  import { online } from 'svelte/reactivity/window'
  import { pwaAssetsHead } from 'virtual:pwa-assets/head'
  import { pwaInfo } from 'virtual:pwa-info'
  import '../../../app.css'
  import { Footer } from './components/Footer'
  import HeaderBar from './components/HeaderBar'
  import PageStateLoader from './components/PageStateLoader'
  import { pageState } from './page.svelte'

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

  afterNavigate((navigation) => {
    if (navigation.from?.route != navigation.to?.route) {
      // Reset form state on navigation
      formState.error = undefined
    }

    if (navigation.to?.url.searchParams.get('reload') === 'true') {
      const searchParams = new URLSearchParams(navigation.to.url.searchParams)
      searchParams.delete('reload')
      const search = searchParams.toString().length > 0 ? `?${searchParams}` : ''
      window.location.href = navigation.to.url.pathname + search
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
  <ProgressBar class="text-secondary-500 z-100!" />
  <Toast.Group {toaster}>
    {#snippet children(toast)}
      <Toast {toast}>
        <Toast.Message>
          <Toast.Title>{toast.title}</Toast.Title>
          <Toast.Description>{toast.description}</Toast.Description>
        </Toast.Message>
        <Toast.CloseTrigger />
      </Toast>
    {/snippet}
  </Toast.Group>

  <HeaderBar />

  <main
    class="relative p-2 md:p-4 {page.data.session?.user == null || pageState.userRegions.length === 0
      ? 'min-h-[calc(100vh-3rem)]'
      : 'min-h-[calc(100vh-3rem-4.515625rem)] md:ms-24 md:min-h-[calc(100vh-3rem)]'}"
  >
    <Breadcrumb url={page.url} />

    {#if page.form?.error ?? formState.error}
      <aside class="card preset-tonal-warning my-8 p-2 whitespace-pre-line md:p-4">
        <p>{online.current ? (page.form?.error ?? formState.error) : 'You are offline'}</p>
      </aside>
    {/if}

    <svelte:boundary>
      {#snippet failed(exception, reset)}
        <Error
          {reset}
          error={dev ? { message: convertException(exception) } : undefined}
          rawError={exception}
          reportError
          status={400}
        />
      {/snippet}

      {#if page.data.session?.user == null}
        {@render children?.()}
      {:else}
        <PageStateLoader>
          {@render children?.()}
        </PageStateLoader>
      {/if}
    </svelte:boundary>
  </main>

  <!-- Footer - only show for logged-out users or on certain pages -->
  {#if page.data.session?.user == null || page.url.pathname.match(/^\/(legal)$/)}
    <Footer />
  {/if}

  {#if page.data.session?.user != null && pageState.userRegions.length > 0}
    <Navigation class="sticky bottom-0 z-50 md:hidden" layout="bar">
      <Navigation.Menu class="grid grid-cols-5 gap-2">
        <NavTiles />
      </Navigation.Menu>
    </Navigation>

    <Navigation class="fixed top-12 hidden h-screen md:block" layout="rail">
      <Navigation.Content>
        <Navigation.Menu>
          <NavTiles />
        </Navigation.Menu>
      </Navigation.Content>
    </Navigation>
  {/if}
</div>

{#await import('$lib/components/ReloadPrompt') then { default: ReloadPrompt }}
  <ReloadPrompt />
{/await}
