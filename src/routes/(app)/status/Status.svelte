<script lang="ts">
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import type { RemoteQueryFunction } from '@sveltejs/kit'

  interface Props {
    query: RemoteQueryFunction<void, boolean>
  }

  const { query }: Props = $props()
</script>

{#await query()}
  <ProgressRing size="size-6" value={null} />
{:then status}
  {#if status}
    <i class="fa-solid fa-circle-check text-success-400 text-xl"></i>
  {:else}
    <i class="fa-solid fa-circle-exclamation text-error-400 text-xl"></i>
  {/if}
{/await}
