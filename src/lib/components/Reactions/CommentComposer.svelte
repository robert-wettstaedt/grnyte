<!--
  The box a comment is written in.

  The same markdown editor every description uses, folded into chat shape (`compact`), so a comment
  can name the route it is about and `@` the person it answers. Imported on demand: TipTap is not
  part of reading a feed, and this component only mounts once a thread is on screen.
-->
<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { COMMENT_MAX_LENGTH } from '$lib/entities/reaction/dto'
  import { postComment } from '$lib/entities/reaction/reactions.remote'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import { slide } from 'svelte/transition'
  import type { CommentThread } from './thread.svelte'

  interface Props {
    /** The conversation this writes into. It names the event and the community itself. */
    thread: CommentThread
  }

  const { thread }: Props = $props()

  const global = getGlobalState()

  /** Motion is the point of the reply label, so somebody who asked for less of it gets none. */
  const still = new MediaQuery('(prefers-reduced-motion: reduce)')

  let failed = $state(false)
  let sending = $state(false)

  const empty = $derived(thread.draft.trim().length === 0)
  /**
   * Said out loud rather than enforced at the keyboard: a rich editor has no equivalent of
   * `<textarea maxlength>` refusing the excess keystroke, and a silent refusal in `send()` would be
   * worse (button looks live, every press does nothing). So the limit disables the button AND names
   * itself, and nothing truncates what somebody pasted.
   */
  const tooLong = $derived(thread.draft.trim().length > COMMENT_MAX_LENGTH)

  async function send() {
    const body = thread.draft.trim()

    if (empty || tooLong || sending) {
      return
    }

    sending = true
    failed = false

    try {
      await postComment({ body, eventId: thread.eventId, parentId: thread.replyTo?.id })
      // Cleared only on success, so a refused post leaves the words in the box rather than
      // throwing away something somebody wrote a moment ago.
      thread.draft = ''
      thread.replyTo = undefined
    } catch {
      // Said out loud, unlike the emoji bar's: a tap that does not land is obvious, a sentence
      // that does not land looks exactly like one that did until the reader scrolls away.
      failed = true
    } finally {
      sending = false
    }
  }
</script>

<div class="flex w-full flex-col gap-1.5">
  <!-- Slides in above the box rather than appearing: it is a row of text that pushes the composer
       (and on the event page, the thread above it) down the moment Reply is pressed, and a shove
       with no motion reads as the page glitching rather than as an answer being aimed. -->
  {#if thread.replyTo != null}
    <p
      class="text-surface-600-400 flex items-center gap-1.5 text-xs"
      transition:slide={{ duration: still.current ? 0 : 130 }}
    >
      <span class="min-w-0 truncate">{m.comments_replyingTo({ name: thread.replyTo.authorName })}</span>

      <button type="button" aria-label={m.comments_cancelReply()} onclick={() => (thread.replyTo = undefined)}>
        <Icon name="close" size={12} />
      </button>
    </p>
  {/if}

  <!-- Aligned on the BOTTOM edge, not the middle: the box grows upward as it fills, and a centred
       row would drift the avatar and the send button up with it, away from the line being typed.
       All three are 2.25rem while the box is one line tall, so they sit on one baseline as a row
       rather than as a box with two things floating beside it. -->
  <div class="flex items-end gap-2">
    <!-- The reader's own face beside the box, which is what says whose name this goes out under. -->
    <Avatar name={global.user?.username ?? ''} size={36} solid loading={global.user == null} />

    <div class="min-w-0 flex-1">
      {#await import('$lib/components/MarkdownEditor/MarkdownEditor.svelte') then { default: MarkdownEditor }}
        <MarkdownEditor
          compact
          onsend={() => void send()}
          placeholder={m.comments_placeholder()}
          regionFk={thread.regionFk}
          bind:value={thread.draft}
        />
      {/await}
    </div>

    <!-- The box stays live while a post is in flight; only the button goes, so a request that never
         settles (wedged connection, sleeping phone) doesn't leave the composer dead holding words
         nobody can edit or copy out.

         `size-9!` AND `box-border`: `btn-icon` ships `content-box`, so a 36px `size-9` was 36px of
         content plus 8px padding per side, standing 16px proud of the avatar beside it. The bang
         settles the utility order; the border box is what makes 36 mean 36. -->
    <button
      class="btn-icon preset-filled-primary-500 box-border size-9! flex-none"
      aria-label={m.comments_post()}
      disabled={sending || empty || tooLong}
      onclick={() => void send()}
      type="button"
    >
      <Icon name="send" size={16} />
    </button>
  </div>

  {#if tooLong}
    <p class="text-error-600-400 text-xs">{m.comments_tooLong({ max: COMMENT_MAX_LENGTH })}</p>
  {:else if failed}
    <p class="text-error-600-400 text-xs">{m.comments_failed()}</p>
  {/if}
</div>
