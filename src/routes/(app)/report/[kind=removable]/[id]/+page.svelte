<script lang="ts">
  import { page } from '$app/state'
  import type { RemovableKind } from '$lib/entities/moderation/dto'
  import ReportForm from './ReportForm.svelte'

  // Keyed, so a report opened from another one starts from its own state.
  const key = $derived(`${page.params.kind}/${page.params.id}`)
</script>

{#key key}
  <ReportForm id={page.params.id ?? ''} kind={page.params.kind as RemovableKind} />
{/key}
