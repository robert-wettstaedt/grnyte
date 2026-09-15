<!--
  One event's reaction bar: its chips, and the button that adds one.

  No allowlist, on every card kind: one would drift from `kindOf()`, and edge cases (a 👍 on a
  deletion) are social, not technical.

  Adding one is two steps like most chat apps: five quick emoji behind the button, the full set
  behind the `+` at their end, keeping the quick row short.

  The quick row floats over the card rather than sitting in the bar: inline, its taller buttons
  pushed the whole footer around as it opened (shoved the changes toggle to a second line on a
  phone, then popped the add button back out of nowhere on close).

  The add button stays always visible rather than hover/long-press revealed, since a phone has no
  hover and a hidden long-press affordance goes undiscovered. It shares the row with the chips so a
  card with reactions doesn't grow twice.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { EventReactionBar } from '$lib/entities/event/card'
  import { QUICK_REACTIONS } from '$lib/entities/reaction/dto'
  import { m } from '$lib/paraglide/messages'
  import { MediaQuery } from 'svelte/reactivity'
  import { scale } from 'svelte/transition'
  import CommentSheet from './CommentSheet.svelte'
  import { dismissOutside } from './dismiss'
  import EmojiPicker from './EmojiPicker.svelte'
  import ReactionChip from './ReactionChip.svelte'
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

  /** Step one: the five quick emoji, floating over the card. */
  let quick = $state(false)
  /** Step two: every emoji there is, in the sheet. */
  let picking = $state(false)

  /** One in flight at a time, for the whole bar. See `createReactionToggle`. */
  const reaction = createReactionToggle(() => ({ eventId: bar.eventId }))

  /** The row grows out of the button it came from, which is motion that explains where it is. Off
   *  when the reader has asked for less of it: `transition:` runs from JS and honours no query. */
  const still = new MediaQuery('(prefers-reduced-motion: reduce)')

  /** Set on the add button, which is outside the floating row and must not dismiss it: the same
   *  press would close it and then reopen it through the toggle below. */
  let adder = $state<HTMLButtonElement>()

  function pick(emoji: string) {
    quick = false
    picking = false
    void reaction.toggle(emoji)
  }

  /**
   * Nothing else dismisses the quick row, so this does. The add button doesn't count as outside,
   * and neither does anything while the full picker is up (it's portaled, so its taps read as
   * outside this row). No `focus()` call here on purpose: the add button keeps focus and the row is
   * next in tab order, so Tab reaches the emoji without a focus ring drawn on every tap that opened it.
   */
  const dismiss = dismissOutside(() => (quick = false), {
    escape: true,
    ignore: () => [adder],
    paused: () => picking,
  })
</script>

<!-- `flex-1` and a trailing alignment, which is what keeps a card with a dozen chips readable: the
     bar takes the width its footer has left, wraps its own rows inside it, and keeps every row
     flush to the same edge the add button is on. Left to size itself it would wrap as a block onto
     a line of its own, orphaning the changes toggle above it and the add button below.
     `flex-col` around it, because the thread belongs under the bar it was opened from. -->
<div class="flex min-w-0 flex-1 flex-col">
  <div class="flex flex-wrap items-center justify-end gap-1">
    {#each bar.chips as chip (chip.emoji)}
      <ReactionChip
        {chip}
        disabled={reaction.busy}
        ontoggle={() => void reaction.toggle(chip.emoji)}
        readonly={bar.readonly}
      />
    {/each}

    {#if showComments}
      <CommentSheet commentCount={bar.commentCount} eventId={bar.eventId} regionFk={bar.regionFk} />
    {/if}

    {#if !bar.readonly}
      <div class="relative flex">
        <button
          bind:this={adder}
          type="button"
          class="text-surface-600-400 hover:text-surface-950-50 flex items-center p-1"
          aria-expanded={quick}
          aria-label={m.reactions_add()}
          onclick={() => (quick = !quick)}
        >
          <Icon name="smilePlus" size={16} />
        </button>

        {#if quick}
          <!-- Opens upward over its own card (downward would cover the next card in the feed). Fixed
           emoji in a fixed order for everyone: a recents row would reorder the fingertip-sized
           targets week to week, which is how the wrong one gets sent. The full picker keeps its own
           frequently-used list for a personal favourite. -->
          <div
            class="border-surface-200-800 bg-surface-50-950 absolute inset-e-0 bottom-full z-10 mb-1 flex origin-bottom-right items-center gap-0.5 rounded-full border p-0.5 shadow-lg"
            transition:scale={{ duration: still.current ? 0 : 140, opacity: 0, start: 0.85 }}
            {@attach dismiss}
          >
            {#each QUICK_REACTIONS as emoji, index (emoji)}
              <button
                type="button"
                class="hover:bg-surface-200-800 rounded-full px-1.5 py-1 text-lg/none"
                disabled={reaction.busy}
                in:scale={{ delay: still.current ? 0 : index * 25, duration: still.current ? 0 : 150, start: 0.4 }}
                onclick={() => pick(emoji)}
              >
                {emoji}
              </button>
            {/each}

            <!-- `h-*` on the card and `h-full` on the picker (which ships a fixed 400px of its own):
             the sheet is shorter than that, and a picker that overflows its own scroll area gets
             a second scrollbar wrapped around the one it already has. -->
            <Modal
              backdrop
              bind:open={picking}
              contentClass="h-[27rem] w-auto"
              fill
              panel={false}
              snapPoints={[0.6]}
              title={m.reactions_pick()}
            >
              {#snippet trigger(props)}
                <button
                  {...props}
                  type="button"
                  class={[
                    props.class,
                    'text-surface-600-400 hover:bg-surface-200-800 hover:text-surface-950-50 rounded-full p-1.5',
                  ]}
                  aria-label={m.reactions_all()}
                  onclick={() => (picking = !picking)}
                >
                  <Icon name="plus" size={16} />
                </button>
              {/snippet}

              {#if picking}
                <EmojiPicker onpick={pick} />
              {/if}
            </Modal>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
