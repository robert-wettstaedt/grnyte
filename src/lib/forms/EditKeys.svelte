<script lang="ts">
  import type { StoreField } from './store.svelte'

  // An edit form's identity (and staleness key, where it has one), absent on create. Rendered so the seed is observable.
  const { id, known }: { id: StoreField<unknown>; known?: StoreField<unknown> } = $props()
</script>

{#if id.value() != null}
  <input {...id.as('hidden')} />
  {#if known != null}
    <input {...known.as('hidden')} />
  {/if}
{/if}
