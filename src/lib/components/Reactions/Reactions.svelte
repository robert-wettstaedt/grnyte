<!--
  One event's reaction bar: its chips, and the button that adds one.

  On every card kind, with no allowlist. An allowlist would have to be maintained in step with
  `kindOf()` and would drift, and the awkward cases (a 👍 on a deletion) are social rather than
  technical.

  Adding one is two steps, the way every chat app does it. The button opens a row of five quick
  emoji, and only the `+` at its end opens the full set. The whole point of a quick row is that it
  is a short list, which it stops being the moment it is stapled to the top of every emoji there is.

  That row floats over the card rather than sitting in the bar. Inline, its taller buttons pushed
  the whole footer around as it opened: on a phone that shoved the changes toggle onto a second
  line, and closing it left the add button popping back out of nowhere where the row had been.
  Floating, the bar never moves and the button never leaves.

  The button is always visible rather than revealed on hover or long press: a phone has no hover,
  and a hidden long-press affordance is one nobody discovers, so the first reaction on any card
  would never get sent from the device most of them are read on. It shares the row with the chips,
  so a card that has reactions does not grow twice.
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
    /**
     * What the card knows about the conversation under it: the chips, the count, whose event it is
     * and where it happened. The whole DTO rather than its fields, so a field added to the bar is
     * added in one place. See `EventReactionBar`.
     */
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
   * Nothing else dismisses the quick row, so this does. The add button does not count as outside,
   * and neither does anything while the full picker is up: it is portaled, so every tap inside it
   * reads as one outside this row, and Escape belongs to whichever layer is on top.
   *
   * The document listeners take no focus of their own. The add button keeps it and the row is the
   * next thing in tab order, so a keyboard reaches the emoji by pressing Tab, which is also why
   * nothing here calls `focus()`. Doing so drew a focus ring on every tap that opened it.
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
          <!-- Anchored to the button's trailing edge and opening upward, over the card it belongs to:
           downward it would cover the next card in the feed, which is somebody else's business.
           Fixed emoji, and in this order for everyone. A recents row reorders, so the button under
           your thumb would mean something different this week than last, and for five
           fingertip-sized targets that is how the wrong one gets sent. The full picker keeps its
           own frequently-used list, which is where a personal favourite lives. -->
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
