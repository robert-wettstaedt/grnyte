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
  import { QUICK_REACTIONS, type ReactionChip as Chip } from '$lib/entities/reaction/dto'
  import { toggleReaction } from '$lib/entities/reaction/reactions.remote'
  import { m } from '$lib/paraglide/messages'
  import type { Attachment } from 'svelte/attachments'
  import { MediaQuery, SvelteSet } from 'svelte/reactivity'
  import { scale } from 'svelte/transition'
  import EmojiPicker from './EmojiPicker.svelte'
  import ReactionChip from './ReactionChip.svelte'

  interface Props {
    /** The event these hang off. An event has an id, so this is the whole handle. */
    eventId: number
    reactions: Chip[]
    /**
     * The reader's own event, so they may read its reactions but not add one. `toggleReaction`
     * refuses the same case; this is what stops the button being there to press.
     */
    readonly?: boolean
  }

  const { eventId, reactions, readonly = false }: Props = $props()

  /** Step one: the five quick emoji, floating over the card. */
  let quick = $state(false)
  /** Step two: every emoji there is, in the sheet. */
  let picking = $state(false)
  /** Emoji currently in flight, so one chip cannot be tapped twice into a race with itself. */
  const pending = new SvelteSet<string>()

  /** The row grows out of the button it came from, which is motion that explains where it is. Off
   *  when the reader has asked for less of it: `transition:` runs from JS and honours no query. */
  const still = new MediaQuery('(prefers-reduced-motion: reduce)')

  /** Set on the add button, which is outside the floating row and must not dismiss it: the same
   *  press would close it and then reopen it through the toggle below. */
  let adder = $state<HTMLButtonElement>()

  async function toggle(emoji: string) {
    if (pending.has(emoji)) {
      return
    }

    // No optimistic write: the chip arrives back through Zero like every other read in the app,
    // and reconciling a local guess against that sync is more machinery than one round trip is
    // worth. Disabling the chip meanwhile is what stops it reading as broken.
    pending.add(emoji)
    try {
      await toggleReaction({ emoji, eventId })
    } finally {
      pending.delete(emoji)
    }
  }

  function pick(emoji: string) {
    quick = false
    picking = false
    void toggle(emoji)
  }

  /**
   * The quick row has no scrim of its own and the card behind it stays live, so nothing else
   * dismisses it. Listeners rather than markup handlers, because a `<div>` that answers keys is a
   * control Svelte would (rightly) want a role on, and this one is only a container.
   */
  const dismiss: Attachment<HTMLElement> = (node) => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      // The full picker is portaled, so every tap inside it reads as one outside this row.
      if (!picking && !node.contains(target) && !adder?.contains(target)) {
        quick = false
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // One layer per press: while the full picker is up, Escape is its own to answer.
      if (event.key === 'Escape' && !picking) {
        quick = false
      }
    }

    // Both on the document: the row takes no focus of its own. The add button keeps it and the row
    // is the next thing in tab order, so a keyboard reaches the emoji by pressing Tab, which is
    // also why nothing here calls `focus()`. Doing so drew a focus ring on every tap that opened it.
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }
</script>

<!-- `flex-1` and a trailing alignment, which is what keeps a card with a dozen chips readable: the
     bar takes the width its footer has left, wraps its own rows inside it, and keeps every row
     flush to the same edge the add button is on. Left to size itself it would wrap as a block onto
     a line of its own, orphaning the changes toggle above it and the add button below. -->
<div class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
  {#each reactions as chip (chip.emoji)}
    <ReactionChip {chip} disabled={pending.has(chip.emoji)} ontoggle={() => void toggle(chip.emoji)} {readonly} />
  {/each}

  {#if !readonly}
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
              disabled={pending.has(emoji)}
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
