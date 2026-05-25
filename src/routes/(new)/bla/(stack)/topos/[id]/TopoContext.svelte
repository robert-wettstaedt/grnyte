<script lang="ts">
  import { setTopoContext, type TopoContext } from '$lib/contexts/topo'
  import type { Snippet } from 'svelte'

  interface Props extends TopoContext {
    children: Snippet
  }

  const { children, ...context }: Props = $props()

  setTopoContext(context)
</script>

{@render children()}
