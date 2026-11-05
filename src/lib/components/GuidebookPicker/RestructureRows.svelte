<script lang="ts">
  import type { IconName } from '$lib/components/Icon/icons'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import { openAfter } from '$lib/components/Modal/nested'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** Delete rights on the entity: Merge, since the merge retires it, and Delete. */
    canMerge: boolean
    /** Edit rights on the entity: Move. */
    canMove: boolean
    /** Closes the menu these rows sit in, before a sheet opens over it. */
    close: () => void
    deleteIcon: IconName
    deleteLabel: string
    ondelete: () => void
    onmerge: () => void
    onmove: () => void
  }

  const { canMerge, canMove, close, deleteIcon, deleteLabel, ondelete, onmerge, onmove }: Props = $props()
</script>

{#if canMove}
  <MenuRow icon="folder-input" label={m.moves_moveTo()} onclick={() => openAfter(close, onmove)} />
{/if}
{#if canMerge}
  <MenuRow icon="merge" label={m.merges_mergeInto()} onclick={() => openAfter(close, onmerge)} />
  <MenuRow
    destructive
    icon={deleteIcon}
    label={deleteLabel}
    onclick={() => {
      close()
      ondelete()
    }}
  />
{/if}
