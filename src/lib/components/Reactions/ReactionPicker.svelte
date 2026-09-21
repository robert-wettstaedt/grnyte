<!--
  The add button and the two steps behind it: five quick emoji floating over the content, the full
  set behind the `+` at their end. Shared by the card bar and a comment's action row, which differ
  only in density and which edge the row grows from.

  The row floats rather than sitting inline: its taller buttons pushed the whole footer around as it
  opened. The button itself stays always visible rather than hover/long-press revealed, since a
  phone has no hover and a hidden long-press affordance goes undiscovered.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { QUICK_REACTIONS } from '$lib/entities/reaction/dto'
  import { m } from '$lib/paraglide/messages'
  import { MediaQuery } from 'svelte/reactivity'
  import { scale } from 'svelte/transition'
  import { dismissOutside } from './dismiss'
  import EmojiPicker from './EmojiPicker.svelte'

  interface Props {
    /** Which edge the row grows from: the end of a right-aligned bar, the start of a comment's row. */
    align?: 'end' | 'start'
    busy?: boolean
    /** Denser, for the row a comment shares with Reply and Delete. */
    compact?: boolean
    /** Off inside a sheet, which answers Escape itself. */
    escape?: boolean
    onpick: (emoji: string) => void
    /** The quick row. Bindable so its owner can close it when a chip elsewhere in the bar sends one. */
    open?: boolean
  }

  let {
    align = 'end',
    busy = false,
    compact = false,
    escape = false,
    onpick,
    open = $bindable(false),
  }: Props = $props()

  /** Step two: every emoji there is, in the sheet. */
  let picking = $state(false)

  /** The row grows out of the button it came from. `transition:` runs from JS and honours no query. */
  const still = new MediaQuery('(prefers-reduced-motion: reduce)')

  /** The add button is outside the row and must not dismiss it: the same press would close it and
   *  then reopen it through the toggle below. */
  let adder = $state<HTMLButtonElement>()

  function pick(emoji: string) {
    open = false
    picking = false
    onpick(emoji)
  }

  /** Nothing else dismisses the row. Nothing counts as outside while the full picker is up, since
   *  it is portaled and its taps read as outside this row. No `focus()` call on purpose: the add
   *  button keeps focus and the row is next in tab order. */
  const dismiss = $derived(
    dismissOutside(() => (open = false), { escape, ignore: () => [adder], paused: () => picking }),
  )
</script>

<div class="relative flex">
  <button
    bind:this={adder}
    type="button"
    class={[
      'text-surface-600-400 hover:text-surface-950-50 flex items-center',
      compact ? 'h-9 min-w-9 justify-center px-2' : 'p-1',
    ]}
    aria-expanded={open}
    aria-label={m.reactions_add()}
    onclick={() => (open = !open)}
  >
    <Icon name="smilePlus" size={compact ? 14 : 16} />
  </button>

  {#if open}
    <!-- Opens upward over what it belongs to: downward it would cover the next card, or the next
         person's line and the composer under it. Fixed emoji in a fixed order for everyone, since a
         recents row reorders fingertip-sized targets week to week. -->
    <div
      class={[
        'border-surface-200-800 bg-surface-50-950 absolute bottom-full z-10 mb-1 flex items-center gap-0.5 rounded-full border p-0.5 shadow-lg',
        align === 'end' ? 'inset-e-0 origin-bottom-right' : 'inset-s-0 origin-bottom-left',
      ]}
      transition:scale={{ duration: still.current ? 0 : 140, opacity: 0, start: 0.85 }}
      {@attach dismiss}
    >
      {#each QUICK_REACTIONS as emoji, index (emoji)}
        <button
          type="button"
          class={['hover:bg-surface-200-800 rounded-full px-1.5 py-1', compact ? 'text-base/none' : 'text-lg/none']}
          disabled={busy}
          in:scale={{ delay: still.current ? 0 : index * 25, duration: still.current ? 0 : 150, start: 0.4 }}
          onclick={() => pick(emoji)}
        >
          {emoji}
        </button>
      {/each}

      <!-- `h-*` on the card and `h-full` on the picker (which ships a fixed 400px of its own): the
           sheet is shorter than that, and a picker that overflows its own scroll area gets a second
           scrollbar wrapped around the one it already has. -->
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
              'text-surface-600-400 hover:bg-surface-200-800 hover:text-surface-950-50 rounded-full',
              compact ? 'p-1' : 'p-1.5',
            ]}
            aria-label={m.reactions_all()}
            onclick={() => (picking = !picking)}
          >
            <Icon name="plus" size={compact ? 14 : 16} />
          </button>
        {/snippet}

        {#if picking}
          <EmojiPicker onpick={pick} />
        {/if}
      </Modal>
    </div>
  {/if}
</div>
