<script lang="ts">
  import ConfirmDialog from '$lib/components/Dialog/Dialog.svelte'
  import RemovalChoice from '$lib/entities/moderation/RemovalChoice.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import MediaToolButton from './MediaToolButton.svelte'

  interface Props {
    /** Whether a moderator is offered tidying up versus removing for breaking the rules. */
    choice: boolean
    id: string
    modal?: boolean
    onDelete: () => Promise<unknown> | void
    open?: boolean
  }

  let { choice, id, modal, onDelete, open = $bindable(false) }: Props = $props()
</script>

{#snippet trigger(attributes: HTMLButtonAttributes)}
  <MediaToolButton {attributes} icon="trash" label={m.common_delete()} />
{/snippet}

{#if choice}
  <RemovalChoice bind:open {id} kind="file" {modal} ontidy={onDelete} title={m.media_delete()} {trigger} />
{:else}
  <ConfirmDialog
    destructive
    {modal}
    {open}
    onOpenChange={(event) => (open = event.open)}
    onsave={onDelete}
    saveText={m.common_delete()}
    title={m.media_delete()}
    {trigger}
  >
    {#snippet content()}
      {m.media_deleteConfirm()}
    {/snippet}
  </ConfirmDialog>
{/if}
