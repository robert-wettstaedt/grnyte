<script lang="ts">
  import type { Snippet } from 'svelte'

  // Nearly every story used to wrap its component in a fixed-width div, because a row or a card
  // sized by its container tells you nothing at full canvas width. That wrapper is the same
  // markup 10 times over, so it lives here and the story says `parameters: { width: 360 }`.
  const { children, width }: { children: Snippet; width?: null | number } = $props()
</script>

{#if width == null}
  {@render children()}
{:else}
  <div style="width: {width}px; max-width: 100%; margin-inline: auto;">
    {@render children()}
  </div>
{/if}
