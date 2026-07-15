<script lang="ts">
  import type { Snippet } from 'svelte'
  import { provideGlobalState, staticGlobalState } from '../src/lib/state/global.svelte'

  const { children }: { children: Snippet } = $props()

  // The empty-but-ready global state components read via getGlobalState().
  // Components needing richer data (grades, user) should pass fixtures to
  // staticGlobalState here when the need arises. Zero itself stays unmocked, so
  // stories must not exercise paths that run queries (e.g. `!type:id!` references).
  provideGlobalState(staticGlobalState())
</script>

{@render children()}
