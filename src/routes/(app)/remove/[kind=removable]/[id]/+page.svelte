<script lang="ts">
  import { page } from '$app/state'
  import { moderationGround, type ModerationGround, type RemovableKind } from '$lib/entities/moderation/dto'
  import RemovalForm from './RemovalForm.svelte'

  // Keyed, so a second removal opened from this one starts from a blank form.
  const key = $derived(`${page.params.kind}/${page.params.id}`)
  // Only a path inside the app: anything else would make this form an open redirect.
  const returnTo = $derived.by(() => {
    const value = page.url.searchParams.get('return')
    if (value == null) return undefined
    try {
      const url = new URL(value, page.url.origin)
      const own = url.origin === page.url.origin && !url.pathname.startsWith('//')
      return own ? url.pathname + url.search : undefined
    } catch {
      return undefined
    }
  })
  const ground = $derived.by(() => {
    const value = page.url.searchParams.get('ground')
    return moderationGround.find((known): known is ModerationGround => known === value)
  })
</script>

{#key key}
  <RemovalForm {ground} id={page.params.id ?? ''} kind={page.params.kind as RemovableKind} {returnTo} />
{/key}
