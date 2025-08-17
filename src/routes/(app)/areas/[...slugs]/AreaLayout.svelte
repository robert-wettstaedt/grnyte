<script lang="ts">
  import { setAreaContext, type AreaContext } from '$lib/contexts/area'
  import type { Snippet } from 'svelte'

  interface Props extends AreaContext {
    children: Snippet
  }

  const { children, ...context }: Props = $props()

  setAreaContext(context)
</script>

{@render children()}
