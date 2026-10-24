<script lang="ts">
  import { resolve } from '$app/paths'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import { m } from '$lib/paraglide/messages'
  import { push } from '$lib/state/navigation.svelte'
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import type { RemovableKind } from './dto'

  interface Props {
    id: number | string
    kind: RemovableKind
    /** False inside another dialog, as the media viewer's confirm is. */
    modal?: boolean
    ontidy: () => Promise<unknown> | void
    open?: boolean
    title: string
    trigger?: Snippet<[HTMLButtonAttributes]>
  }

  let { id, kind, modal, ontidy, open = $bindable(), title, trigger }: Props = $props()
</script>

<Dialog
  destructive
  {modal}
  onOpenChange={(details) => (open = details.open)}
  onsave={ontidy}
  {open}
  saveText={m.moderation_tidyUp()}
  secondary={{
    onclick: () => push(resolve('/(app)/remove/[kind=removable]/[id]', { id: String(id), kind })),
    text: m.moderation_breaksRules(),
  }}
  {title}
  {trigger}
>
  {#snippet content()}
    {m.moderation_choiceBody()}
  {/snippet}
</Dialog>
