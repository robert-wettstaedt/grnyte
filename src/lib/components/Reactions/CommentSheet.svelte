<!--
  One event's thread from the feed, and the button that opens it.

  A sheet on a phone and a right-hand aside on a desktop, one `Modal` (same pair the topo viewer and
  the entity log use). Not an expander inside the card: a conversation wants the screen while it is
  being read and none of it while it is not, and a card that grows by twenty comments pushes the
  feed out from under the reader's thumb.

  The event's own page renders the same two pieces stacked in flow instead, over its own thread
  (`thread.svelte.ts`), which is what a notification links to: an anchored comment wants a URL, and
  a sheet has none.

  Nothing loads until it opens: the feed carries `comment_count` and this carries the words, so a
  region full of conversations costs a scrolling reader one integer per card.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { m } from '$lib/paraglide/messages'
  import { tick } from 'svelte'
  import CommentComposer from './CommentComposer.svelte'
  import Comments from './Comments.svelte'
  import { createThread } from './thread.svelte'

  interface Props {
    /** What the button says before anything is loaded. Off `events.comment_count`. */
    commentCount: number
    /** The event the thread hangs off, which is the whole handle the server needs. */
    eventId: number
    /** Whose community this is, so the composer's `@` picker has members to offer. */
    regionFk: number
  }

  const { commentCount, eventId, regionFk }: Props = $props()

  let open = $state(false)
  /**
   * Whether this card's dialog exists at all. A `Modal` renders its dialog CLOSED rather than not
   * at all (a full `Dialog`/`Portal`/positioner/`MediaQuery` per instance whether or not anybody
   * opened it), which is fifty of each on a scrolled feed if mounted eagerly. So the button is
   * plain markup and the dialog builds on first press, then stays mounted: reopening a thread
   * already visited should be instant, with the expensive part (query, editor) guarded by `open`.
   */
  let mounted = $state(false)

  const thread = createThread(() => ({ eventId, regionFk }), { enabled: () => open })
</script>

<!-- Always shown, even on your own card: being the person a card is about is the most likely reason
     to have something to say under it, so a thread with nothing in it still reads as an invitation.
     Outside the `Modal` rather than passed to it as a trigger, since the panel it opens is fixed to
     the edge of the screen and never anchors to this button. -->
<button
  type="button"
  class="text-surface-600-400 hover:text-surface-950-50 flex items-center gap-1 p-1 text-xs"
  aria-label={commentCount === 0 ? m.comments_placeholder() : m.comments_show({ count: commentCount })}
  onclick={async () => {
    mounted = true
    // A frame apart, deliberately: setting both at once mounts the sheet already open, which has
    // nothing to transition FROM (the first press snapped it into place, every later one slid it
    // up). `tick()` waits for the mount so the closed state paints first, then the sheet opens.
    await tick()
    requestAnimationFrame(() => (open = true))
  }}
>
  <Icon name="messageCircle" size={16} />
  {#if commentCount > 0}
    <span>{commentCount}</span>
  {/if}
</button>

{#if mounted}
  <Modal
    backdrop
    contentClass="h-full w-96 rounded-none border-y-0 border-r-0 lg:w-105"
    fill
    bind:open
    panel
    panelClass="fixed inset-y-0 right-0 z-60"
    snapPoints={[0.9]}
    subtitle={commentCount > 0 ? m.comments_show({ count: commentCount }) : undefined}
    title={m.comments_title()}
  >
    {#if open}
      <Comments {thread} />
    {/if}

    <!-- Pinned (via `Modal.mobile`'s footer handling), so the box stays reachable over a long thread
         and above the phone keyboard. Guarded by `open` exactly as the body is: a closed dialog
         still renders its footer, and an unguarded one would boot a TipTap editor for every thread
         anybody has ever opened. -->
    {#snippet footer()}
      {#if open}
        <CommentComposer {thread} />
      {/if}
    {/snippet}
  </Modal>
{/if}
