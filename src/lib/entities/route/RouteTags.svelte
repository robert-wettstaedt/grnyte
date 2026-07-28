<script lang="ts">
  interface Props {
    /** The region's own tag strings, rendered verbatim. */
    tags: string[]
  }

  const { tags }: Props = $props()
</script>

{#if tags.length > 0}
  <div class="flex min-w-0 flex-wrap items-center gap-1">
    {#each tags as tag (tag)}
      <span class="badge preset-tonal text-[11px] font-semibold">{tag}</span>
    {/each}
  </div>
{/if}
