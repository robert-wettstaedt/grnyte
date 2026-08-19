<!--
  The thread under one event: what people have said, and what each of them is answering.

  Two levels and no more. A reply files under the comment it answers, and answering a reply files
  under that same comment (`postComment` re-points it), so this renders a list of comments each
  with a flat list of answers rather than a tree. A third level of indent is unreadable at phone
  width and buys nothing: the sentence names who it is for.

  Markdown, like every other body of text in the app: a comment can name the route it is about and
  the person it is answering, and both resolve through the same `!type:id!` references a
  description carries. Rendered through `Markdown`, so a name that changes is right everywhere.
-->
<script lang="ts">
  import { resolve } from '$app/paths'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import type { CommentListItem } from '$lib/entities/reaction/dto'
  import { deleteComment, restoreComment } from '$lib/entities/reaction/reactions.remote'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { now } from '$lib/state/now.svelte'
  import { withUndo } from '$lib/state/toast'
  import CommentReactions from './CommentReactions.svelte'
  import type { CommentThread } from './thread.svelte'

  interface Props {
    /** The conversation, which also carries what a permalink pointed at. */
    thread: CommentThread
  }

  const { thread }: Props = $props()

  const highlightId = $derived(thread.highlightId)

  /**
   * Bring the linked comment into view once, when it arrives.
   *
   * An attachment rather than an effect over the list: the node is what has to exist, and it only
   * exists after the thread has synced (which is what `createThread`'s highlight window is for).
   * `block: 'center'` because the composer is pinned over the bottom of the sheet and a comment
   * scrolled to the end sits behind it.
   */
  const reveal = (node: HTMLElement) => {
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  /**
   * Take a comment back, and offer to put it back.
   *
   * Undo rather than a confirmation dialog: the row is soft-deleted, so restoring it is one column
   * and the id, the replies and the reactions under it never left. A prompt in front of every
   * delete taxes the many people who meant it to protect the few who did not, and it cannot be
   * answered on the thread it is about, because it covers it.
   */
  const remove = (commentId: number) =>
    void withUndo(deleteComment({ commentId }), {
      message: m.comments_deleted(),
      onUndo: (id) => restoreComment({ commentId: id }),
    })
</script>

{#snippet line(comment: CommentListItem, size: number)}
  <article
    class={[
      'flex gap-2 rounded-lg py-1 pe-1 transition-colors duration-1000',
      // An accent on the edge rather than a wash over the whole line: a permalink should land
      // somewhere that looks pointed at, and a tinted block reads as a stuck text selection.
      comment.id === highlightId ? 'border-primary-500 border-s-2 ps-2' : 'ps-1',
    ]}
    {@attach comment.id === highlightId ? reveal : () => undefined}
  >
    <!-- Both halves of the byline lead to the person: an avatar is the thing readers aim at, and a
         name that is not a link when the same name IS one inside the body ("@ada") is the kind of
         inconsistency people read as a bug. -->
    <a class="flex-none" href={resolve('/(app)/users/[id]', { id: String(comment.authorFk) })}>
      <Avatar name={comment.authorName} {size} solid loading={comment.authorName.length === 0} />
    </a>

    <div class="min-w-0 flex-1">
      <p class="text-surface-600-400 flex items-baseline gap-1.5 text-xs">
        <a
          class="text-surface-950-50 font-semibold"
          href={resolve('/(app)/users/[id]', { id: String(comment.authorFk) })}
        >
          {comment.authorName}
        </a>

        <time datetime={new Date(comment.createdAt).toISOString()}>
          {formatUploadedAt(comment.createdAt, now(), getLocale())}
        </time>
      </p>

      <Markdown className="text-sm break-words" markdown={comment.body} />

      <!-- One row under the sentence: what people have already said about it, then what this
           reader can do about it. Both are answers to the same line, so a second row for the
           chips would say they belong to something else.

           36px in BOTH axes on a 12px label, and the row is pulled back out to the text edge by
           the padding that buys them: a target that is tall but 20px wide is still the one that
           gets missed on a phone. -->
      <div class="-ms-2 flex flex-wrap items-center gap-x-1 gap-y-0.5">
        <CommentReactions {comment} eventId={thread.eventId} />

        <button
          type="button"
          class="text-surface-600-400 hover:text-surface-950-50 flex h-9 min-w-9 items-center justify-center px-2 text-xs font-semibold"
          onclick={() => (thread.replyTo = comment)}
        >
          {m.comments_reply()}
        </button>

        {#if comment.mine}
          <button
            type="button"
            class="text-surface-600-400 hover:text-error-500 flex h-9 min-w-9 items-center justify-center px-2 text-xs"
            aria-label={m.comments_delete()}
            onclick={() => remove(comment.id)}
          >
            <Icon name="trash" size={14} />
          </button>
        {/if}
      </div>
    </div>
  </article>
{/snippet}

<QueryState resource={thread.comments}>
  {#snippet ready()}
    <div class="flex flex-col gap-3">
      {#if thread.hasEarlier}
        <button
          type="button"
          class="text-surface-600-400 hover:text-surface-950-50 self-start text-xs font-semibold"
          onclick={() => thread.loadEarlier()}
        >
          {m.comments_loadEarlier()}
        </button>
      {/if}

      {#each thread.comments.data as comment (comment.id)}
        <div class="flex flex-col gap-2">
          {@render line(comment, 28)}

          {#if comment.replies.length > 0}
            <!-- Indented under the comment they answer, with a rule rather than a second avatar
                 column: at this width the indent is what says "these belong to that", and the rule
                 is what keeps it readable once two threads sit next to each other. -->
            <div class="border-surface-200-800 ms-4 flex flex-col gap-2 border-s ps-3">
              {#each comment.replies as reply (reply.id)}
                {@render line(reply, 22)}
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/snippet}

  {#snippet empty()}
    <!-- An empty thread is an invitation, not a failure, so it says what to do with it. -->
    <div class="space-y-1 py-10 text-center">
      <span class="bg-surface-200-800 text-surface-600-400 mx-auto mb-3 grid size-14 place-items-center rounded-2xl">
        <Icon name="messageCircle" size={24} />
      </span>

      <p class="text-surface-950-50 font-semibold">{m.comments_empty()}</p>
      <p class="text-surface-600-400 text-sm">{m.comments_emptyBody()}</p>
    </div>
  {/snippet}
</QueryState>
