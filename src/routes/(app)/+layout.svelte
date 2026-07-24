<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import Toaster from '$lib/components/Toaster/Toaster.svelte'
  import { setUnitPreference } from '$lib/i18n/units.svelte'
  import { reportClientError } from '$lib/logging/report'
  import { setGlobalState } from '$lib/state/global.svelte'
  import { trackHistoryDepth } from '$lib/state/navigation.svelte'
  import markdownLightCssUrl from 'github-markdown-css/github-markdown-light.css?url'
  import { pwaAssetsHead } from 'virtual:pwa-assets/head'
  import { pwaInfo } from 'virtual:pwa-info'

  const { children, data } = $props()

  const globalState = setGlobalState()

  // Feed the user's stored unit preference to the shared formatters (distance, temperature).
  // Re-runs when settings sync/change; null falls back to locale inference.
  $effect(() => {
    setUnitPreference(globalState?.user?.userSettings?.unitSystem ?? null)
  })

  // Feed Supabase token refreshes to Zero. Supabase rotates the access token
  // hourly; without this, zero-cache rejects the stale token, the sync socket
  // dies in `needs-auth` (Zero does not retry that state), and the app silently
  // serves only what is already in the local replica (anything else loads
  // forever). Invalidation re-runs the layout load (`depends('supabase:auth')`),
  // and initZero hands the fresh token to the existing client.
  $effect(() => {
    const { data: auth } = data.supabase.auth.onAuthStateChange((_, newSession) => {
      if (newSession?.access_token !== data.session?.access_token) {
        void invalidate('supabase:auth')
      }
    })

    return () => auth.subscription.unsubscribe()
  })

  // Track same-origin history depth app-wide so back buttons (and the media viewer's
  // close) can fall back to an in-app route instead of leaving the origin. Lives at the
  // (app) root so the count stays accurate across every page, not just the map area.
  trackHistoryDepth()

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

  <!-- theme-color is managed in app.html so it can track the resolved light/dark theme. -->
  {#each pwaAssetsHead.links as link (link.href)}
    <link {...link} />
  {/each}

  <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted build-time PWA web manifest -->
  {@html webManifest}
</svelte:head>

{#if globalState?.isLoading}
  <LoadingIndicator class="fixed flex h-full w-full items-center justify-center" size={20} />
{:else}
  <!-- Shared viewport frame. Nested layouts fill it: (shell) adds the nav rail and
       tab bar around the main scroll area; the /areas editors deliberately omit them. -->
  <div class="fixed inset-0 flex">
    <!-- Walls off client render/effect crashes so one broken page doesn't blank the
         whole app. Does NOT catch event-handler or async errors — see hooks.client. -->
    <svelte:boundary onerror={(error) => reportClientError(error)}>
      {@render children()}

      {#snippet failed()}
        <main class="relative min-w-0 flex-1 overflow-y-auto">
          <ErrorState type="generic" />
        </main>
      {/snippet}
    </svelte:boundary>
  </div>
{/if}

<Toaster />
