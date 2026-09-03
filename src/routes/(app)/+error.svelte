<script lang="ts">
  import { browser } from '$app/environment'
  import { page } from '$app/state'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import { isOnline } from '$lib/state/online.svelte'

  // Load / SSR / navigation failures land here. A dead connection trumps the status code (an offline
  // navigation usually surfaces as a generic 500).
  //
  // `isOnline()` rather than `navigator.onLine`: the raw flag reads true on a fresh document load
  // with the network already dead, so an offline failure was reported as `server` ("this one's on
  // us, not you") directly under a status bar saying the reader was offline.
  const type = $derived(
    browser && !isOnline() ? 'offline' : page.status === 404 ? 'notfound' : page.status >= 500 ? 'server' : 'generic',
  )
</script>

<main class="relative min-w-0 flex-1 overflow-y-auto">
  <ErrorState {type} />
</main>
