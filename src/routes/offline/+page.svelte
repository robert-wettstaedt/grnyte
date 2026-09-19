<script lang="ts">
  import { resolve } from '$app/paths'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { replaceUrl } from '$lib/state/navigation.svelte'
  import { onMount } from 'svelte'

  // This component only renders when somebody is genuinely on `/offline`. The service worker serves
  // the prerendered shell in place for other routes, so those boot straight into the page they asked
  // for and never mount this. Nothing to show at this path, so send them to the map.
  onMount(() => {
    void replaceUrl(resolve('/(app)/(shell)/(explore)/(map)/explore'))
  })
</script>

<LoadingIndicator class="fixed inset-0 flex items-center justify-center" size={20} />
