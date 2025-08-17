<script lang="ts">
  import { setRouteContext, type RouteContext } from '$lib/contexts/route'
  import type { Snippet } from 'svelte'

  interface Props extends RouteContext {
    children: Snippet
  }

  const { children, ...context }: Props = $props()

  setRouteContext(context)
</script>

{@render children()}
