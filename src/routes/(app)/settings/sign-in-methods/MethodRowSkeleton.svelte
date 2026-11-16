<script lang="ts">
  import { rowFrame } from './MethodRow.svelte'

  /** Width of the title bar, in percent. */
  const { width = 35 }: { width?: number } = $props()
</script>

<!-- The frame sits inside a plain wrapper, as in MethodRow, so a row's divider adds to it alike. -->
<div>
  <div class={rowFrame}>
    <span class="bg-surface-200-800 size-9 flex-none animate-pulse rounded-[10px]"></span>
    <span class="flex flex-1 flex-col gap-1.5">
      <span class="bg-surface-200-800 h-3.5 animate-pulse rounded" style:width="{width}%"></span>
      <span class="bg-surface-200-800 h-2.75 w-1/4 animate-pulse rounded"></span>
    </span>
  </div>
</div>
