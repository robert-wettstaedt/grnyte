<script lang="ts">
  import type { Snippet } from 'svelte'
  import { provideGlobalState, staticGlobalState, type GlobalState } from '../src/lib/state/global.svelte'
  import { GRADES } from './grades'

  // The already-ready global state components read via getGlobalState(), carrying the seeded
  // grades. A story adds a user or region permissions with `parameters: { globalState: {...} }`.
  // Zero stays unmocked, so stories must not exercise paths that run queries.
  const { children, state }: { children: Snippet; state?: Parameters<typeof staticGlobalState>[0] } = $props()

  provideGlobalState(staticGlobalState({ grades: GRADES, ...state }) satisfies GlobalState)
</script>

{@render children()}
