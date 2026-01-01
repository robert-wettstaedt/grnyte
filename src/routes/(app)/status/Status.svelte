<script lang="ts">
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import type { RemoteQueryFunction } from '@sveltejs/kit'

  interface Props {
    query: RemoteQueryFunction<void, boolean>
  }

  const { query }: Props = $props()
</script>

{#await query()}
  <LoadingIndicator class="w-auto" size={6} />
{:then status}
  {#if status}
    <i class="fa-solid fa-circle-check text-success-400 text-xl"></i>
  {:else}
    <i class="fa-solid fa-circle-exclamation text-error-400 text-xl"></i>
  {/if}
{/await}
