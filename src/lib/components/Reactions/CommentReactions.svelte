<!--
  The emoji under one comment.

  The same table, the same toggle and the same chip as a card's bar, one level down: an emoji whose
  `parent_fk` is a comment takes its own slot in `reactions_one_emoji_idx`, so a reader holds one
  on the card and one more on each comment under it.

  Deliberately thinner than `Reactions`: the five quick emoji and nothing else. The full picker
  belongs to the card, where a reaction is about the climb; under a sentence it is agreement,
  disagreement or applause, and a 400px picker over a phone-height thread to say so is the reader
  losing their place in the conversation to pick a fruit.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { QUICK_REACTIONS, type CommentListItem } from '$lib/entities/reaction/dto'
  import { m } from '$lib/paraglide/messages'
  import { MediaQuery } from 'svelte/reactivity'
  import { scale } from 'svelte/transition'
  import { dismissOutside } from './dismiss'
  import ReactionChip from './ReactionChip.svelte'
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

  const still = new MediaQuery('(prefers-reduced-motion: reduce)')

  /**
   * Send one, and close the quick row on the way.
   *
   * Both paths go through here, chips included. A pointer press on a chip is a press outside the row
   * and `dismiss` would close it anyway, but a chip reached by keyboard fires a click with no
   * pointer event in front of it, and the row would be left standing over the answer it just sent.
   */
  function pick(emoji: string) {
    picking = false
    void reaction.toggle(emoji)
  }

  /** The row has no scrim and the thread behind it stays live, so nothing else dismisses it. Escape
   *  is left alone here: the sheet this sits in answers it. */
  const dismiss = dismissOutside(() => (picking = false))
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
    <div class="relative flex">
      <button
        type="button"
        class="text-surface-600-400 hover:text-surface-950-50 flex h-9 min-w-9 items-center justify-center px-2"
        aria-expanded={picking}
        aria-label={m.reactions_add()}
        onclick={() => (picking = !picking)}
      >
        <Icon name="smilePlus" size={14} />
      </button>

      {#if picking}
        <!-- Opening upward and anchored to the button, over the comment it belongs to: downward it
             would cover the next person's line, and on the last comment of a thread it would open
             into the composer. -->
        <div
          class="border-surface-200-800 bg-surface-50-950 absolute bottom-full left-0 z-10 mb-1 flex origin-bottom-left items-center gap-0.5 rounded-full border p-0.5 shadow-lg"
          transition:scale={{ duration: still.current ? 0 : 140, opacity: 0, start: 0.85 }}
          {@attach dismiss}
        >
          {#each QUICK_REACTIONS as emoji (emoji)}
            <button
              type="button"
              class="hover:bg-surface-200-800 rounded-full px-1.5 py-1 text-base/none"
              disabled={reaction.busy}
              onclick={() => pick(emoji)}
            >
              {emoji}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
