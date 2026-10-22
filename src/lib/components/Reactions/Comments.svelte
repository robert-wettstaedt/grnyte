<!--
  The thread under one event: what people have said, and what each of them is answering.

  Two levels and no more: a reply to a reply files under the same top comment (`postComment`
  re-points it), so this renders comments each with a flat list of answers rather than a tree. A
  third level of indent is unreadable at phone width and buys nothing, since the sentence already
  names who it is for.

  Markdown, like every other body of text in the app: a comment can name the route it is about and
  the person it is answering through the same `!type:id!` references a description carries,
  rendered through `Markdown` so a name that changes is right everywhere.
-->
<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { authorHref } from '$lib/entities/href'
  import type { CommentListItem } from '$lib/entities/reaction/dto'
  import { deleteComment, restoreComment } from '$lib/entities/reaction/writes'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { runCommand } from '$lib/remote/mutation'
  import { motion, prefersStill } from '$lib/state/motion.svelte'
  import { now } from '$lib/state/now.svelte'
  import { notifyError } from '$lib/state/toast'
  import { untrack } from 'svelte'
  import { fade } from 'svelte/transition'
  import CommentReactions from './CommentReactions.svelte'
  import type { CommentThread } from './thread.svelte'

  interface Props {
    /** The conversation, which also carries what a permalink pointed at. */
    thread: CommentThread
  }

  const { thread }: Props = $props()

  const highlightId = $derived(thread.highlightId)

  /**
   * Bring the linked comment into view once, when it arrives. An attachment rather than an effect
   * over the list: the node has to exist first, which is what `createThread`'s highlight window is
   * for. `block: 'center'` because the composer is pinned over the bottom of the sheet and a
   * comment scrolled to the end sits behind it.
   */
  const reveal = (node: HTMLElement) => {
    node.scrollIntoView({ behavior: untrack(prefersStill) ? 'auto' : 'smooth', block: 'center' })
  }

  // Undo in place, not in a toast the sheet's focus trap hides. An entry outlives its restore until
  // the row syncs back, so the thread never shows neither.
  type Gone = { comment: CommentListItem; eventId: number; parentId: null | number; restoring: boolean }
  let gone = $state<Gone[]>([])
  // Which button takes focus when it mounts: the undo a press made, or the comment it restored.
  let focusTarget: null | string = null
  const live = $derived(new Set(thread.comments.data.flatMap((c) => [c.id, ...c.replies.map((r) => r.id)])))
  // The event page keeps this component across events, so a tombstone is filed under its own.
  const tombstones = $derived(gone.filter((entry) => entry.eventId === thread.eventId && !live.has(entry.comment.id)))

  type Row = { comment: CommentListItem; gone?: Gone }
  const merged = (comments: CommentListItem[], parentId: null | number): Row[] =>
    [
      ...comments.map((comment) => ({ comment })),
      ...tombstones
        .filter((entry) => entry.parentId === parentId)
        .map((entry) => ({ comment: entry.comment, gone: entry })),
    ].sort((a, b) => a.comment.createdAt - b.comment.createdAt || a.comment.id - b.comment.id)

  const remove = async (comment: CommentListItem, parentId: null | number) => {
    // A second tap before the row leaves would be refused and take the first tap's Undo with it.
    if (gone.some((entry) => entry.comment.id === comment.id && !entry.restoring)) return
    gone = [
      ...gone.filter((entry) => entry.comment.id !== comment.id),
      { comment, eventId: thread.eventId, parentId, restoring: false },
    ]
    focusTarget = `undo-${comment.id}`
    try {
      await runCommand(deleteComment(comment.id))
    } catch (cause) {
      gone = gone.filter((entry) => entry.comment.id !== comment.id)
      notifyError(cause)
    }
  }

  // Once a restore has synced back the entry is spent; kept, a later delete elsewhere would revive it.
  $effect(() => {
    if (gone.some((entry) => entry.restoring && live.has(entry.comment.id))) {
      gone = gone.filter((entry) => !(entry.restoring && live.has(entry.comment.id)))
    }
  })

  const undo = async (entry: Gone) => {
    if (entry.restoring) return
    entry.restoring = true
    // Set first: the row can sync back before the mutation answers.
    focusTarget = `delete-${entry.comment.id}`
    try {
      await runCommand(restoreComment(entry.comment.id))
    } catch (cause) {
      entry.restoring = false
      notifyError(cause)
    }
  }

  // Focus follows the swap both ways, or it falls to the body when the pressed button unmounts.
  const focusIf = (key: string) => (node: HTMLElement) => {
    if (focusTarget !== key) return
    node.focus()
    focusTarget = null
  }
</script>

{#snippet tombstone(entry: Gone)}
  <!-- A fade in and no outro: the row swaps in place for the comment, so sliding would stack both. -->
  <div
    class="text-surface-600-400 flex items-center gap-2 py-1 ps-1 text-sm"
    role="status"
    in:fade={{ duration: motion(150) }}
  >
    <Icon name="trash" size={14} />
    <span class="flex-1" id="comment-gone-{entry.comment.id}">{m.comments_deleted()}</span>
    <button
      type="button"
      class="text-primary-600-400 flex h-9 min-w-9 items-center justify-center px-2 text-xs font-semibold"
      aria-describedby="comment-gone-{entry.comment.id}"
      aria-disabled={entry.restoring}
      onclick={() => undo(entry)}
      {@attach focusIf(`undo-${entry.comment.id}`)}
    >
      {m.common_undo()}
    </button>
  </div>
{/snippet}

{#snippet line(comment: CommentListItem, size: number, parentId: null | number)}
  {@const profile = authorHref(comment.author)}
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
    <svelte:element this={profile == null ? 'span' : 'a'} class="flex-none" href={profile}>
      <Avatar author={comment.author} {size} solid />
    </svelte:element>

    <div class="min-w-0 flex-1">
      <p class="text-surface-600-400 flex items-baseline gap-1.5 text-xs">
        <svelte:element this={profile == null ? 'span' : 'a'} class="text-surface-950-50 font-semibold" href={profile}>
          {comment.author.name}
        </svelte:element>

        <time datetime={new Date(comment.createdAt).toISOString()}>
          {formatUploadedAt(comment.createdAt, now(), getLocale())}
        </time>
      </p>

      <Markdown className="text-sm break-words" markdown={comment.body} />

      <!-- One row under the sentence, since a second row for the chips would say they belong to
           something else. 36px in BOTH axes on a 12px label: a target tall but 20px wide is still
           the one that gets missed on a phone. -->
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
            onclick={() => remove(comment, parentId)}
            {@attach focusIf(`delete-${comment.id}`)}
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

      {#each merged(thread.comments.data, null) as { comment, gone: entry } (comment.id)}
        {#if entry != null}
          {@render tombstone(entry)}
        {:else}
          {@const replies = merged(comment.replies, comment.id)}
          <div class="flex flex-col gap-2">
            {@render line(comment, 28, null)}

            {#if replies.length > 0}
              <!-- Indented under the comment they answer, with a rule rather than a second avatar
                 column: at this width the indent is what says "these belong to that", and the rule
                 is what keeps it readable once two threads sit next to each other. -->
              <div class="border-surface-200-800 ms-4 flex flex-col gap-2 border-s ps-3">
                {#each replies as { comment: reply, gone: replyGone } (reply.id)}
                  {#if replyGone != null}
                    {@render tombstone(replyGone)}
                  {:else}
                    {@render line(reply, 22, comment.id)}
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/snippet}

  {#snippet empty()}
    <!-- Deleting the last comment must not take its undo with it. Top level only: a reply cannot be
         restored while its comment is gone. -->
    {@const roots = tombstones.filter((entry) => entry.parentId === null)}
    {#if roots.length > 0}
      <div class="flex flex-col gap-3">
        {#each roots as entry (entry.comment.id)}
          {@render tombstone(entry)}
        {/each}
      </div>
    {:else}
      <!-- An empty thread is an invitation, not a failure, so it says what to do with it. -->
      <div class="space-y-1 py-10 text-center">
        <span class="bg-surface-200-800 text-surface-600-400 mx-auto mb-3 grid size-14 place-items-center rounded-2xl">
          <Icon name="messageCircle" size={24} />
        </span>

        <p class="text-surface-950-50 font-semibold">{m.comments_empty()}</p>
        <p class="text-surface-600-400 text-sm">{m.comments_emptyBody()}</p>
      </div>
    {/if}
  {/snippet}
</QueryState>
