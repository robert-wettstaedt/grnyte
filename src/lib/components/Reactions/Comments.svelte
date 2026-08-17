<!--
  The thread under one event: what people have said, and the box to say something.

  Flat, and only what hangs directly off the event. `parent_fk` is in the schema and the fan-out
  already reaches everybody in the thread, so replies are additive rather than something this
  shape forecloses; nothing writes one today.

  Plain text, deliberately, where the rest of the app renders markdown. A comment is a sentence,
  and the editor that would let it be more than that is 50KB of TipTap plus a toolbar taller than
  most of the comments under it.
-->
<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { COMMENT_MAX_LENGTH, type CommentListItem } from '$lib/entities/reaction/dto'
  import { deleteComment, postComment } from '$lib/entities/reaction/reactions.remote'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { now } from '$lib/state/now.svelte'

  interface Props {
    /**
     * What is in the box, owned by the bar above so it survives the thread being collapsed.
     * Somebody who types three sentences and taps the toggle by mistake keeps them.
     */
    body: string
    comments: CommentListItem[]
    /** The event the thread hangs off, which is the whole handle the server needs. */
    eventId: number
    onbody: (value: string) => void
  }

  const { body, comments, eventId, onbody }: Props = $props()

  let failed = $state(false)
  let sending = $state(false)

  async function send() {
    const text = body.trim()
    if (text.length === 0 || sending) {
      return
    }

    sending = true
    failed = false
    try {
      await postComment({ body: text, eventId })
      // Cleared only on success, so a refused post leaves the words in the box rather than
      // throwing away something somebody just wrote.
      onbody('')
    } catch {
      // Said out loud, unlike the emoji bar's: a tap that does not land is obvious, a sentence
      // that does not land looks exactly like one that did until the reader scrolls away.
      failed = true
    } finally {
      sending = false
    }
  }

  /**
   * Grow with the text. `field-sizing: content` is not everywhere yet, and a one-line box that
   * scrolls its own content is how a comment gets written blind.
   *
   * Reads `body`, which is what makes the attachment re-run when it changes: a post clears the box
   * without an `input` event, and a four-line box that stays four lines tall after sending is the
   * next comment starting in a hole.
   */
  const autosize = (node: HTMLTextAreaElement) => {
    void body
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }
</script>

<div class="border-surface-200-800 mt-2 flex flex-col gap-2 border-t pt-2">
  {#if comments.length === 0}
    <p class="text-surface-600-400 text-xs">{m.comments_empty()}</p>
  {/if}

  {#each comments as comment (comment.id)}
    <article class="flex gap-2">
      <Avatar name={comment.authorName} size={24} solid loading={comment.authorName.length === 0} />

      <div class="min-w-0 flex-1">
        <p class="text-surface-600-400 flex items-baseline gap-1.5 text-xs">
          <span class="text-surface-950-50 font-semibold">{comment.authorName}</span>
          <time datetime={new Date(comment.createdAt).toISOString()}>
            {formatUploadedAt(comment.createdAt, now(), getLocale())}
          </time>
        </p>

        <!-- `whitespace-pre-wrap`, so the line breaks somebody typed are the line breaks they see,
             and `break-words` so a pasted URL cannot widen the card. -->
        <p class="text-surface-950-50 text-sm break-words whitespace-pre-wrap">{comment.body}</p>
      </div>

      {#if comment.mine}
        <button
          type="button"
          class="text-surface-600-400 hover:text-surface-950-50 self-start p-1"
          aria-label={m.comments_delete()}
          onclick={() => void deleteComment({ commentId: comment.id }).catch(() => undefined)}
        >
          <Icon name="trash" size={14} />
        </button>
      {/if}
    </article>
  {/each}

  <form
    class="flex items-end gap-2"
    onsubmit={(event) => {
      event.preventDefault()
      void send()
    }}
  >
    <!-- One row that grows with what is typed, rather than a box sized for an essay: most
         comments are one line, and a three-row textarea under every card is most of a card. -->
    <!-- The box stays live while a post is in flight; only the button goes. A request that never
         settles (a wedged connection, a sleeping phone) would otherwise leave the composer dead,
         holding words nobody can edit or copy out. -->
    <textarea
      class="textarea max-h-32 min-h-9 flex-1 resize-none py-1.5 text-sm"
      maxlength={COMMENT_MAX_LENGTH}
      placeholder={m.comments_placeholder()}
      rows={1}
      value={body}
      {@attach autosize}
      oninput={(event) => {
        autosize(event.currentTarget)
        onbody(event.currentTarget.value)
      }}
      onkeydown={(event) => {
        // Enter sends, Shift+Enter breaks the line, which is what every chat box does. Not on a
        // soft keyboard, where Enter IS the line break and there is a send button beside it.
        if (event.key === 'Enter' && !event.shiftKey && !matchMedia('(pointer: coarse)').matches) {
          event.preventDefault()
          void send()
        }
      }}
    ></textarea>

    <button
      class="btn-icon preset-filled-primary-500"
      aria-label={m.comments_post()}
      disabled={sending || body.trim().length === 0}
      type="submit"
    >
      <Icon name="send" size={16} />
    </button>
  </form>

  {#if failed}
    <p class="text-error-600-400 text-xs">{m.comments_failed()}</p>
  {/if}
</div>
