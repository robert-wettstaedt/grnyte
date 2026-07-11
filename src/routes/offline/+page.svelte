<script lang="ts">
  import { page } from '$app/state'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { replaceUrl } from '$lib/state/navigation.svelte'
  import { onMount } from 'svelte'

  onMount(() => {
    // The service worker serves this prerendered shell for offline navigations,
    // bouncing here with the original path in `?redirect`. Hand off to it client-
    // side — the (app) routes are CSR-only and read their data from Zero's local
    // store, so they render without a network round-trip. (Runtime path from the
    // service worker, not a static route; goto rejects external URLs.)
    const target = page.url.searchParams.get('redirect') ?? '/explore'
    void replaceUrl(target)
  })
</script>

<LoadingIndicator class="fixed inset-0 flex items-center justify-center" size={20} />
