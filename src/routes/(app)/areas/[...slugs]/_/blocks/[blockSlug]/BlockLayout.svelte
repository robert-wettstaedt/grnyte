<script lang="ts">
  import { setBlockContext, type BlockContext } from '$lib/contexts/block'
  import type { Snippet } from 'svelte'

  interface Props extends BlockContext {
    children: Snippet
  }

  const { children, ...context }: Props = $props()

  setBlockContext(context)
</script>

{@render children()}
