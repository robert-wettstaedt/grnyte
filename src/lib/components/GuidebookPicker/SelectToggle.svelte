<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import type { Selection } from './selection.svelte'

  // The trailing "Select" of a list's heading row, "Done" while selecting.
  const { selection }: { selection: Selection } = $props()
</script>

<button
  class="text-primary-600-400 shrink-0 text-sm font-semibold active:scale-[0.97]"
  onclick={() => (selection.active ? selection.done() : selection.start())}
  type="button"
>
  {selection.active ? m.common_done() : m.moves_select()}
</button>
