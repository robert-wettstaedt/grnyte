<script lang="ts">
  import { browser } from '$app/environment'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import { m } from '$lib/paraglide/messages'
  import { isOnline } from '$lib/state/online.svelte'

  // The boundary outside the app shell: unmatched routes, (landing), /legal, /help, /f.
  const type = $derived(
    browser && !isOnline() ? 'offline' : page.status === 404 ? 'notfound' : page.status >= 500 ? 'server' : 'generic',
  )
</script>

<!-- Its own viewport box: the root layout has no frame, unlike the (app) twin's content pane. -->
<div class="fixed inset-0 flex flex-col overflow-y-auto">
  <!-- Home, not the default Explore, which bounces a signed-out reader to /auth. -->
  <ErrorState primaryAction={{ href: resolve('/'), label: m.common_home() }} {type} />
</div>
