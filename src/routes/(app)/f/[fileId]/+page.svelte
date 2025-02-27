<script lang="ts">
  import { fitHeightAction } from '$lib/actions/fit-height.svelte.js'
  import { Full } from '$lib/components/FileViewer'

  const { data } = $props()
</script>

{#if data.file.stat != null}
  <div class="bg-black w-full" use:fitHeightAction={{ paddingBottom: 0 }}>
    <Full file={data.file} stat={data.file.stat} />
  </div>
{/if}
