<script lang="ts">
  import type { Snippet } from 'svelte'
  import { provideGlobalState, staticGlobalState } from '../src/lib/state/global.svelte'
  import { GRADES } from './grades'

  const { children }: { children: Snippet } = $props()

  // The already-ready global state components read via getGlobalState(). It carries the
  // seeded grade table, so anything resolving a gradeFk to a label (activity cards, route
  // rows) renders the real thing. Components needing more (a user, regions) should pass
  // further fixtures to staticGlobalState here. Zero itself stays unmocked, so stories
  // must not exercise paths that run queries (e.g. `!type:id!` references).
  provideGlobalState(staticGlobalState({ grades: GRADES }))
</script>

{@render children()}
