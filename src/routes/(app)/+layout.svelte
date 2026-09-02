<script lang="ts">
  import { invalidate } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import StatusBar from '$lib/components/StatusBar/StatusBar.svelte'
  import Toaster from '$lib/components/Toaster/Toaster.svelte'
  import { UNREAD_CAP } from '$lib/entities/notification/resources.svelte'
  import { REGIONLESS_PATHS } from '$lib/entities/region/dto'
  import { setUnitPreference } from '$lib/i18n/units.svelte'
  import { reportClientError } from '$lib/logging/report'
  import { m } from '$lib/paraglide/messages.js'
  import { requestPersistentStorage } from '$lib/state/device.svelte'
  import { setGlobalState } from '$lib/state/global.svelte'
  import { trackHistoryDepth } from '$lib/state/navigation.svelte'
  import { syncPushSubscription } from '$lib/state/push.svelte'
  import markdownLightCssUrl from 'github-markdown-css/github-markdown-light.css?url'

  const { children, data } = $props()

  const globalState = setGlobalState()

  /**
   * Whether this route has the app shell around it.
   *
   * A `(shell)` route paints its nav rail and tab bar before the store is warm and spins inside its
   * own content area instead (see `(shell)/+layout.svelte`). Everything else under `(app)` is a
   * chromeless editor or detail screen with nothing worth showing early, so it keeps the
   * full-screen indicator below.
   */
  const isShellRoute = $derived(page.route.id?.includes('(shell)') ?? false)

  // Ask once per load that the browser keep our storage rather than treating it as disposable.
  // Covers the Zero replica and the service worker's topo cache together, which is also how the
  // browser evicts them: whole origin at a time, never in parts.
  void requestPersistentStorage()

  // Put this device's push subscription and the server's row back in step, once per load. Here
  // rather than in `PushSetup`, which only renders on three surfaces: somebody who lives in the
  // feed and the map would never mount it, and never have a dropped subscription repaired.
  //
  // Caught, unlike the call above: this one genuinely rejects (an aborted `subscribe()`, a remote
  // call made offline) and `hooks.client.ts` turns unhandled rejections into error reports.
  void syncPushSubscription().catch(() => undefined)

  // Feed the user's stored unit preference to the shared formatters (distance, temperature).
  // Re-runs when settings sync/change; null falls back to locale inference.
  $effect(() => {
    setUnitPreference(globalState?.user?.userSettings?.unitSystem ?? null)
  })

  // Carry the unread count outside the app, onto the installed icon. Only what was aimed at this
  // person: a badge fed by region activity would never be zero and would stop meaning anything.
  // Feature-detected because the Badging API is absent in Firefox and in every browser tab on
  // iOS, where it only exists for an installed PWA.
  $effect(() => {
    if (!('setAppBadge' in navigator)) {
      return
    }

    // Capped the same way the bell is, which is the point: the query syncs one row past the cap
    // so the bell can say "99+", and an OS badge reading 100 next to a bell reading 99+ is the
    // two-counts-disagreeing problem the dot on the tab exists to avoid.
    const unread = Math.min(globalState?.unreadNotifications ?? 0, UNREAD_CAP)
    // Rejections are ignored on purpose: the permission can be revoked at any time, and a badge
    // that cannot be set is not something to tell anybody about.
    void (unread > 0 ? navigator.setAppBadge(unread) : navigator.clearAppBadge()).catch(() => undefined)
  })

  // Feed Supabase token refreshes to Zero. Supabase rotates the access token
  // hourly; without this, zero-cache rejects the stale token, the sync socket
  // dies in `needs-auth` (Zero does not retry that state), and the app silently
  // serves only what is already in the local replica (anything else loads
  // forever). Invalidation re-runs the layout load (`depends('supabase:auth')`),
  // and initZero hands the fresh token to the existing client.
  $effect(() => {
    const supabase = data?.supabase

    if (supabase == null) {
      return
    }

    const { data: auth } = supabase.auth.onAuthStateChange((_, newSession) => {
      if (newSession?.access_token !== data.session?.access_token) {
        void invalidate('supabase:auth')
      }
    })

    return () => auth.subscription.unsubscribe()
  })

  // The client-side twin of authGuard's region-less bounce. That hook only ever sees document
  // loads: this group is `ssr = false` with (almost) no server loads, so navigating to /explore
  // from inside the app never reaches it.
  //
  // A document navigation rather than `goto`, because the hook is the only thing that can see a
  // live invitation, and on arrival it redirects to that instead. /explore keeps its own
  // region-less empty state for the case this cannot cover: a replica that never completes
  // (offline, dead sync socket) leaves this effect silent.
  $effect(() => {
    // `isComplete`, not `isLoading`: a freshly loaded Zero replica reports ready-with-nothing
    // before the server has confirmed anything, and bouncing on that throws a member with regions
    // onto the create screen. This only fires once the server has actually said "no memberships".
    const regions = globalState?.userRegionsResource

    if (regions == null || !regions.isComplete || regions.data.length > 0) {
      return
    }

    if (REGIONLESS_PATHS.some((regionless) => regionless === page.url.pathname)) {
      location.href = resolve('/(app)/regions/new')
    }
  })

  // Track same-origin history depth app-wide so back buttons (and the media viewer's
  // close) can fall back to an in-app route instead of leaving the origin. Lives at the
  // (app) root so the count stays accurate across every page, not just the map area.
  trackHistoryDepth()

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
</svelte:head>

{#if globalState?.isStoreCold}
  <!-- Tested ahead of `isLoading` because it is a *kind* of loading: offline with an empty store,
       nothing on the way, and nothing the reader can do inside the app to change it. Left to
       `isLoading` this is a full-screen spinner that never resolves, with no status bar behind it
       to say why. -->
  <div class="fixed inset-0 flex flex-col">
    <StatusBar />
    <ErrorState
      type="offline"
      title={m.error_storeCold_title()}
      description={globalState.lastSyncedAt == null
        ? m.error_storeCold_bodyFirstRun()
        : m.error_storeCold_bodyRestore()}
    />
  </div>
{:else if globalState?.isLoading && !isShellRoute}
  <!-- Chromeless routes only. None of the shell's chrome reads anything `isLoading` waits on:
       `StatusBar` and `(shell)/+layout.svelte` touch no global state at all, and the rail and tab
       bar read only `unreadNotifications`, which is already excluded from `isLoading` for exactly
       this reason. So a shell route can paint its frame immediately and spin in its content area.
       This does not make the app usable any sooner: the wait is `ZeroRep.init` replaying the
       replica, which is O(rows) and unchanged. It is the difference between a bare spinner and a
       page that is visibly loading, which on a 5000-route region lasts about 1.4 seconds. -->
  <LoadingIndicator class="fixed flex h-full w-full items-center justify-center" size={20} />
{:else}
  <!-- Shared viewport frame. Nested layouts fill it: (shell) adds the nav rail and
       tab bar around the main scroll area; the /areas editors deliberately omit them. -->
  <div class="fixed inset-0 flex flex-col">
    <!-- Pushes content down rather than overlaying it: nothing occluded, no z-index
         against the sheet/modal stack. Every (app) route gets it, including the
         chromeless editors, which hide navigation and not warnings. -->
    <StatusBar />

    <!-- transform-gpu makes this row the containing block for the app's `fixed` chrome
         (nav rail, tab bar, map overlays), so they sit below the bar instead of under
         it. Dialogs portal to <body> and stay viewport-fixed, which is what they want. -->
    <div class="flex min-h-0 flex-1 transform-gpu">
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
  </div>
{/if}

<Toaster />
