<script lang="ts">
  import { browser } from '$app/environment'
  import { page } from '$app/state'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'

  // Load / SSR / navigation failures land here. A dead connection trumps the
  // status code (an offline navigation usually surfaces as a generic 500).
  const type = $derived(
    browser && !navigator.onLine
      ? 'offline'
      : page.status === 404
        ? 'notfound'
        : page.status >= 500
          ? 'server'
          : 'generic',
  )
</script>

<main class="relative min-w-0 flex-1 overflow-y-auto">
  <ErrorState {type} />
</main>
