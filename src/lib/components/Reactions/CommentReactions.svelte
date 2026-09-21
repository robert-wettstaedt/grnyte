<!--
  The emoji under one comment: the same table, toggle, chip and picker as a card's bar, one level
  down (an emoji whose `parent_fk` is a comment takes its own slot in `reactions_one_emoji_idx`, so
  a reader holds one on the card and one more on each comment under it).

  Denser than `Reactions`, since the row is shared with Reply and Delete, and Escape is left to the
  sheet this sits in.
-->
<script lang="ts">
  import { type CommentListItem } from '$lib/entities/reaction/dto'
  import ReactionChip from './ReactionChip.svelte'
  import ReactionPicker from './ReactionPicker.svelte'
  import { createReactionToggle } from './toggle.svelte'

  interface Props {
    comment: CommentListItem
    /** The event the comment hangs under, which the write needs alongside the comment's own id. */
    eventId: number
  }

  const { comment, eventId }: Props = $props()

  let picking = $state(false)

  /** One in flight at a time, per comment: one row per person per target. See `createReactionToggle`. */
  const reaction = createReactionToggle(() => ({ commentId: comment.id, eventId }))

  /**
   * Send one, and close the quick row on the way: both paths go through here, chips included. A
   * pointer press on a chip is outside the row, so `dismiss` would close it anyway, but a chip
   * reached by keyboard fires no pointer event, and the row would be left standing over the answer.
   */
  function pick(emoji: string) {
    picking = false
    void reaction.toggle(emoji)
  }
</script>

<!-- `contents`, so the chips and the add button are laid out by the action row itself rather than
     in a box of their own: they belong to the same line of controls as Reply and Delete, and a
     wrapper here would put them on a row by themselves. -->
<div class="contents">
  {#each comment.reactions as chip (chip.emoji)}
    <ReactionChip {chip} disabled={reaction.busy} ontoggle={() => pick(chip.emoji)} readonly={comment.mine} />
  {/each}

  <!-- Not on your own line: nobody applauds their own sentence, and `toggleReaction` refuses it
       anyway. The chips stay, so you can still see who agreed with you. -->
  {#if !comment.mine}
    <ReactionPicker align="start" busy={reaction.busy} compact onpick={pick} bind:open={picking} />
  {/if}
</div>
