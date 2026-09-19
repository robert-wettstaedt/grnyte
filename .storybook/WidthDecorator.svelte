<script lang="ts">
  import type { Snippet } from 'svelte'

  // A row or a card sized by its container tells you nothing at full canvas width, so a story
  // that needs a fixed width says `parameters: { width: 360 }` instead of duplicating the wrapper.
  const { children, width }: { children: Snippet; width?: null | number } = $props()
</script>

{#if width == null}
  {@render children()}
{:else}
  <div style="width: {width}px; max-width: 100%; margin-inline: auto;">
    {@render children()}
  </div>
{/if}
