<script lang="ts">
  import { getParkingContext, setParkingContext, type ParkingContext } from '$lib/contexts/parking'
  import type { Snippet } from 'svelte'

  interface Props extends ParkingContext {
    children: Snippet
  }

  const { children, ...context }: Props = $props()

  setParkingContext(context)
</script>

{@render children()}
