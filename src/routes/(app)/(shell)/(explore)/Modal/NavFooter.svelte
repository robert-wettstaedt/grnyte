<!-- Shared desktop sheet footer: centres the prev/next nav controls, reading the current
     siblings from sheetState.nav. Renders nothing while no page has set it. -->
<script lang="ts">
  import SiblingNav from '$lib/components/SiblingNav/SiblingNav.svelte'
  import { sheetState } from './sheetState.svelte'
</script>

{#if sheetState.nav}
  {@const nav = sheetState.nav}
  <footer class="border-surface-100-900 flex shrink-0 items-center justify-center gap-1.5 border-t-2 px-4 py-3">
    <SiblingNav {nav} />
  </footer>
{/if}
