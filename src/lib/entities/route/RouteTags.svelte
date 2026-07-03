<script lang="ts">
  interface Props {
    /** Tag ids as stored (`SD`, `trav-l-r`, …) — rendered verbatim. */
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
