<!--
  One emoji and its count.

  A click toggles your own reaction; the secondary gesture (hold on a finger, right click on a
  mouse) lists who sent it. Two gestures on one control, which is only safe because neither of them
  ends in the click the primary one needs.

  Its own component so each chip owns the open state of its own popover. Tracking that in the bar
  meant a light dismiss closed the popover without the bar ever hearing about it.
-->
<script lang="ts">
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { ReactionChip } from '$lib/entities/reaction/dto'
  import { m } from '$lib/paraglide/messages'
  import { createContextAttachment } from './contextGesture'

  interface Props {
    chip: ReactionChip
    disabled: boolean
    ontoggle: () => void
    /** The reader wrote this card, so the chip reads its reactors and toggles nothing. */
    readonly?: boolean
  }

  const { chip, disabled, ontoggle, readonly = false }: Props = $props()

  let showing = $state(false)
</script>

<Modal backdrop bind:open={showing} contentClass="w-56" panel={false} title={m.reactions_who({ emoji: chip.emoji })}>
  {#snippet trigger(props)}
    <!-- `onclick` after the spread, so the chip's own toggle wins over the popover's trigger
         handler. The popover is opened by the hold and the right click, never by a tap. -->
    <button
      {...props}
      type="button"
      class={[
        props.class,
        'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        // A hold must not select the count or raise the iOS callout on its way to the popover.
        'touch-manipulation select-none [-webkit-touch-callout:none]',
        chip.mine
          ? 'border-primary-500 bg-primary-500/15 text-primary-700-300'
          : 'border-surface-200-800 text-surface-600-400 hover:text-surface-950-50',
      ]}
      aria-label={m.reactions_who({ emoji: chip.emoji })}
      aria-pressed={readonly ? undefined : chip.mine}
      {disabled}
      onclick={() => !readonly && ontoggle()}
      {@attach createContextAttachment((active) => (showing = active))}
    >
      <span aria-hidden="true">{chip.emoji}</span>
      <span>{chip.count}</span>
    </button>
  {/snippet}

  <ul class="flex flex-col gap-1 p-3 text-sm">
    <!-- Keyed by position: two people can share a display name, and nothing here is reordered. -->
    {#each chip.names as name, index (index)}
      <li>{name}</li>
    {/each}
  </ul>
</Modal>
