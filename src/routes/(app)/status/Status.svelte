<script lang="ts">
  import { Progress } from '@skeletonlabs/skeleton-svelte'
  import type { RemoteQueryFunction } from '@sveltejs/kit'

  interface Props {
    query: RemoteQueryFunction<void, boolean>
  }

  const { query }: Props = $props()
</script>

{#await query()}
  <Progress value={null}>
    <Progress.Circle class="[--size:--spacing(6)]">
      <Progress.CircleTrack />
      <Progress.CircleRange />
    </Progress.Circle>
    <Progress.ValueText />
  </Progress>
{:then status}
  {#if status}
    <i class="fa-solid fa-circle-check text-success-400 text-xl"></i>
  {:else}
    <i class="fa-solid fa-circle-exclamation text-error-400 text-xl"></i>
  {/if}
{/await}
