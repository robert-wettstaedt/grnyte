import type { CommentListItem } from '$lib/entities/reaction/dto'
import { COMMENT_PAGE_SIZE, commentList } from '$lib/entities/reaction/resources.svelte'

export type CommentThread = ReturnType<typeof createThread>

/** Which conversation a thread is, which is also everything a write under it has to name. */
export interface ThreadTarget {
  eventId: number
  /** Whose community it happened in, so the composer's `@` picker has members to offer. */
  regionFk: number
}

/**
 * How far back a link is worth reaching for the line it names.
 *
 * A thread opens on its newest 30, and a notification can be two weeks and sixty comments old:
 * without this the reader lands on an unhighlighted thread that never scrolls, with nothing saying
 * the sentence they tapped is behind "Show earlier comments". Five windows is 150 comments, past
 * which a link into a conversation that long is better answered by the reader scrolling than by
 * syncing the lot to a phone.
 */
const HIGHLIGHT_MAX_PAGES = 5

/**
 * One thread's state, shared by the two places a thread is read.
 *
 * The feed opens it in a sheet and the event's own page renders it inline, and both need the same
 * things: which conversation this is, the window over it, how far back it reaches, what the composer
 * is answering, and what is half-written in it. Holding them here rather than in each container is
 * what keeps the list and the composer two components that can be stacked in flow or split across a
 * sheet's body and its pinned footer.
 *
 * The target is the thread's, not the composer's: a `CommentComposer` that took its own `eventId`
 * could post into an event the list beside it is not showing, which is a bug no test would catch
 * because both halves would look right on their own.
 */
export function createThread(
  target: () => ThreadTarget,
  opts?: {
    enabled?: () => boolean
    /** The comment a permalink named, which the window grows to reach and the list lights up. */
    highlight?: () => number | undefined
  },
) {
  let draft = $state('')
  let limit = $state(COMMENT_PAGE_SIZE)
  let replyTo = $state<CommentListItem | undefined>(undefined)

  /**
   * The id on its own, memoized, and that is the point rather than tidiness.
   *
   * The target getter reads the event ROW on the event's own page (`regionFk` comes off it and only
   * resolves once Zero has synced), so a query getter that called `target()` would depend on every
   * snapshot of that row: a new object each time, and the thread's query rebuilt for an id that has
   * not moved. A `$derived` over a number stops there, because an unchanged value notifies nobody.
   */
  const eventId = $derived(target().eventId)

  const comments = commentList(() => ({ eventId, limit }), opts)

  /** A full window means there is something older behind it. */
  const hasEarlier = () => comments.data.length >= limit

  /** Plain, not `$state`: the effect below reads it to stop itself, nothing renders it. */
  let pulled = 0

  /**
   * Grow the window until the linked comment is inside it.
   *
   * The list can only scroll to a node that exists, and the node only exists once the row is in the
   * synced window, so this is the half that makes an old link work at all. It stops on the first of
   * three: the comment arrived, there is nothing older left, or five windows have been pulled (a
   * comment that was deleted, or one that never was on this event, would otherwise walk the whole
   * thread looking for it).
   *
   * Here rather than in the list, because `limit` is here: a renderer that grows somebody else's
   * window is paging policy in markup, and the rule can only be read by mounting it.
   */
  $effect(() => {
    const id = opts?.highlight?.()

    if (id == null || holds(comments.data, id) || !hasEarlier() || pulled >= HIGHLIGHT_MAX_PAGES) {
      return
    }

    pulled += 1
    limit += COMMENT_PAGE_SIZE
  })

  return {
    get comments() {
      return comments
    },
    /**
     * What is typed and not yet sent.
     *
     * Held here rather than in the composer, which unmounts with the sheet: closing a thread must
     * not throw away three sentences somebody was in the middle of writing. This survives the
     * toggle because the caller holds it, and dies with the card, which is the right lifetime.
     */
    get draft() {
      return draft
    },
    set draft(value: string) {
      draft = value
    },
    /** The event this thread hangs off, which every write under it has to name. */
    get eventId() {
      return eventId
    },
    get hasEarlier() {
      return hasEarlier()
    },
    /** What a permalink pointed at, which the list draws an accent on. */
    get highlightId() {
      return opts?.highlight?.()
    },
    loadEarlier() {
      limit += COMMENT_PAGE_SIZE
    },
    /** The community the composer's `@` picker offers. */
    get regionFk() {
      return target().regionFk
    },
    /** What the composer is answering, or nothing. Cleared on send and by the composer's X. */
    get replyTo() {
      return replyTo
    },
    set replyTo(comment: CommentListItem | undefined) {
      replyTo = comment
    },
  }
}

/** Whether the window holds a given comment, on either level. */
function holds(comments: readonly CommentListItem[], id: number): boolean {
  return comments.some((comment) => comment.id === id || comment.replies.some((reply) => reply.id === id))
}
