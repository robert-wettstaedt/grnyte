<script lang="ts">
  import { page } from '$app/state'
  import type { RemovableKind } from '$lib/entities/moderation/dto'
  import RemovalForm from './RemovalForm.svelte'

  // Keyed, so a second removal opened from this one starts from a blank form.
  const key = $derived(`${page.params.kind}/${page.params.id}`)
</script>

{#key key}
  <RemovalForm id={page.params.id ?? ''} kind={page.params.kind as RemovableKind} />
{/key}
