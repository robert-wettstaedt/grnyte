<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { m } from '$lib/paraglide/messages'
  import { sheetState } from '../../Modal/sheetState.svelte'

  // The (map) layout renders this inside the shared Modal sheet, which draws its
  // header from sheetState — give it a title so the placeholder doesn't open blank.
  $effect(() => {
    sheetState.title = m.common_block()
    sheetState.subtitle = null
  })
</script>

<svelte:head>
  <title>{m.common_block()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<p class="text-surface-600-400 py-8 text-center">{m.common_comingSoon()}</p>
