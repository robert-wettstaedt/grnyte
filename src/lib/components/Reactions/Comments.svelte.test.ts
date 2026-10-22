import type { CommentListItem } from '$lib/entities/reaction/dto'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { expect, it, vi } from 'vitest'
import Comments from './Comments.svelte'
import type { CommentThread } from './thread.svelte'

const writes = vi.hoisted(() => ({
  deleteComment: vi.fn(async (id: number) => ({ data: id })),
  restoreComment: vi.fn(async () => ({})),
}))
vi.mock('$lib/entities/reaction/writes', () => writes)
vi.mock('$lib/state/motion.svelte', () => ({ motion: () => 0, prefersStill: () => true }))
vi.mock('$lib/components/Markdown/Markdown.svelte', () => ({ default: () => {} }))
vi.mock('./CommentReactions.svelte', () => ({ default: () => {} }))

const comment = (id: number, createdAt: number, replies: CommentListItem[] = []): CommentListItem => ({
  author: { id: 1, name: 'ada' },
  body: `comment ${id}`,
  createdAt,
  id,
  mine: true,
  reactions: [],
  replies,
})

const thread = (data: CommentListItem[]) => {
  const comments = $state<{ data: CommentListItem[]; phase: unknown }>({ data, phase: { kind: 'answered' } })
  const value = { comments, eventId: 1, hasEarlier: false, highlightId: undefined } as unknown as CommentThread
  return { comments, value }
}

it('puts an undo where the deleted comment was, and restores it from there', async () => {
  const { comments, value } = thread([comment(1, 10), comment(2, 20)])
  const { container } = render(Comments, { thread: value })

  await fireEvent.click(screen.getAllByRole('button', { name: 'Delete comment' })[0])
  expect(writes.deleteComment).toHaveBeenCalledWith(1)

  // The delete synced: the comment leaves the query, and its undo takes its place, first in line.
  comments.data = [comment(2, 20)]
  flushSync()
  const rows = [...container.querySelectorAll('[role="status"], article')]
  expect(rows[0].getAttribute('role')).toBe('status')
  expect(rows[0].textContent).toContain('Comment deleted')

  await fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(writes.restoreComment).toHaveBeenCalledWith(1)
})

it('keeps the undo when the deleted comment was the only one', async () => {
  const { comments, value } = thread([comment(1, 10)])
  render(Comments, { thread: value })

  await fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
  comments.data = []
  comments.phase = { empty: true, kind: 'answered' }
  flushSync()

  expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
})

it('ignores a second delete tap, which the server would refuse and take the undo with it', async () => {
  writes.deleteComment.mockClear()
  const { comments, value } = thread([comment(1, 10)])
  render(Comments, { thread: value })

  const button = screen.getByRole('button', { name: 'Delete comment' })
  await fireEvent.click(button)
  await fireEvent.click(button)
  expect(writes.deleteComment).toHaveBeenCalledTimes(1)

  comments.data = []
  comments.phase = { empty: true, kind: 'answered' }
  flushSync()
  expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)
})

// Deletes the first of two comments and lets the delete sync.
const deleteFirstOfTwo = async () => {
  const { comments, value } = thread([comment(1, 10), comment(2, 20)])
  render(Comments, { thread: value })
  await fireEvent.click(screen.getAllByRole('button', { name: 'Delete comment' })[0])
  comments.data = [comment(2, 20)]
  flushSync()
  return comments
}

it('moves focus to the undo that replaced the pressed button', async () => {
  await deleteFirstOfTwo()

  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Undo' }))
})

it('leaves an event its tombstones when the thread moves to another', async () => {
  const state = $state({
    comments: { data: [comment(1, 10)], phase: { kind: 'answered' } as unknown },
    eventId: 1,
    hasEarlier: false,
    highlightId: undefined,
  })
  render(Comments, { thread: state as unknown as CommentThread })

  await fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
  state.eventId = 2
  state.comments.data = [comment(5, 50)]
  flushSync()

  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
})

it('gives focus back to the restored comment, not to a reply tombstone that mounts with it', async () => {
  const reply = comment(2, 20)
  const { comments, value } = thread([comment(1, 10, [reply])])
  render(Comments, { thread: value })

  await fireEvent.click(screen.getAllByRole('button', { name: 'Delete comment' })[1])
  comments.data = [comment(1, 10)]
  flushSync()
  await fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
  comments.data = []
  comments.phase = { empty: true, kind: 'answered' }
  flushSync()

  await fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  comments.data = [comment(1, 10)]
  comments.phase = { kind: 'answered' }
  flushSync()

  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete comment' }))
})

it('forgets a restored comment, so a later delete elsewhere leaves no dead undo', async () => {
  const comments = await deleteFirstOfTwo()
  await fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  comments.data = [comment(1, 10), comment(2, 20)]
  flushSync()

  comments.data = [comment(2, 20)]
  flushSync()
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
})

it('names a comment whose author deleted their account, without linking a profile', () => {
  const { value } = thread([{ ...comment(1, 10), author: { id: null, name: 'Deleted user' } }])
  const { container } = render(Comments, { thread: value })

  const article = container.querySelector('article')!
  expect(article.textContent).toContain('Deleted user')
  expect(article.querySelector('a[href*="/users/"]')).toBeNull()
})
