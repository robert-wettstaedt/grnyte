<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { onMount } from 'svelte'

  onMount(() => {
    // The service worker serves this prerendered shell for offline navigations,
    // bouncing here with the original path in `?redirect`. Hand off to it client-
    // side — the (app) routes are CSR-only and read their data from Zero's local
    // store, so they render without a network round-trip.
    const target = page.url.searchParams.get('redirect') ?? '/explore'
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- runtime path from the service worker, not a static route; goto rejects external URLs.
    goto(target, { replaceState: true })
  })
</script>

<LoadingIndicator class="fixed inset-0 flex items-center justify-center" size={20} />
