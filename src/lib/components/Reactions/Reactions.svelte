<!--
  One event's reaction bar: its chips, and the picker that adds one.

  No allowlist, on every card kind: one would drift from `kindOf()`, and edge cases (a 👍 on a
  deletion) are social, not technical.
-->
<script lang="ts">
  import type { EventReactionBar } from '$lib/entities/event/card'
  import CommentSheet from './CommentSheet.svelte'
  import ReactionChip from './ReactionChip.svelte'
  import ReactionPicker from './ReactionPicker.svelte'
  import { createReactionToggle } from './toggle.svelte'

  interface Props {
    /** The whole `EventReactionBar` DTO rather than its individual fields, so a field added to the
     *  bar is added in one place. */
    bar: EventReactionBar
    /**
     * Whether the bar offers a way into the thread. Off on the event's own page, where the
     * thread is already rendered in flow under the card.
     */
    showComments?: boolean
  }

  const { bar, showComments = true }: Props = $props()

  let quick = $state(false)

  /** One in flight at a time, for the whole bar. See `createReactionToggle`. */
  const reaction = createReactionToggle(() => ({ eventId: bar.eventId }))

  /** Chips go through here too, so a chip reached by keyboard (no pointer event, so nothing
   *  dismisses) doesn't leave the quick row standing over the card. */
  function pick(emoji: string) {
    quick = false
    void reaction.toggle(emoji)
  }
</script>

<!-- `flex-1` and a trailing alignment, which is what keeps a card with a dozen chips readable: the
     bar takes the width its footer has left, wraps its own rows inside it, and keeps every row
     flush to the same edge the add button is on. Left to size itself it would wrap as a block onto
     a line of its own, orphaning the changes toggle above it and the add button below.
     `flex-col` around it, because the thread belongs under the bar it was opened from. -->
<div class="flex min-w-0 flex-1 flex-col">
  <div class="flex flex-wrap items-center justify-end gap-1">
    {#each bar.chips as chip (chip.emoji)}
      <ReactionChip {chip} disabled={reaction.busy} ontoggle={() => pick(chip.emoji)} readonly={bar.readonly} />
    {/each}

    {#if showComments}
      <CommentSheet commentCount={bar.commentCount} eventId={bar.eventId} regionFk={bar.regionFk} />
    {/if}

    {#if !bar.readonly}
      <ReactionPicker busy={reaction.busy} escape onpick={pick} bind:open={quick} />
    {/if}
  </div>
</div>
