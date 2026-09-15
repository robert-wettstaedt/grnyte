import type { CommentListItem } from '$lib/entities/reaction/dto'
import { COMMENT_PAGE_SIZE, commentList } from '$lib/entities/reaction/resources.svelte'

export type CommentThread = ReturnType<typeof createThread>

/** Which conversation a thread is, which is also everything a write under it has to name. */
export interface ThreadTarget {
  eventId: number
  /** Whose community it happened in, so the composer's `@` picker has members to offer. */
  regionFk: number
}

/** Cap on how many pages a permalink pulls to reach an old comment; beyond 150 comments, manual
 *  scrolling beats syncing the rest of a long thread to find one link. */
const HIGHLIGHT_MAX_PAGES = 5

/**
 * One thread's state, shared by the feed's sheet and the event page's inline view, so both stay
 * stackable/splittable instead of duplicating state per container.
 *
 * The target lives on the thread, not the composer: a composer with its own `eventId` could post
 * into an event the list beside it isn't showing, a bug two correct-looking halves would hide.
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
   * Memoized on purpose: `target()` reads the event ROW on the event's page (`regionFk` resolves
   * only once Zero syncs), so a query getter calling it directly would rebuild on every new row
   * snapshot even when the id hasn't moved. A `$derived` over the id alone stops that.
   */
  const eventId = $derived(target().eventId)

  const comments = commentList(() => ({ eventId, limit }), opts)

  /** A full window means there is something older behind it. */
  const hasEarlier = () => comments.data.length >= limit

  /** Plain, not `$state`: the effect below reads it to stop itself, nothing renders it. */
  let pulled = 0

  /**
   * Grow the window until the linked comment is inside it (the list can only scroll to a node that
   * exists). Stops on the first of: comment arrived, nothing older left, or five windows pulled -
   * the last guards against a deleted or off-event comment id walking the whole thread.
   *
   * Lives here rather than in the list because `limit` is here: a renderer growing somebody else's
   * window would be paging policy hidden in markup.
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
    /** What is typed and not yet sent. Held here, not in the composer (which unmounts with the
     *  sheet), so closing a thread mid-sentence doesn't throw the draft away. */
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
