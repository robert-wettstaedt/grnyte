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
const viewer = vi.hoisted(() => ({ permissions: ['region.read'] as string[] }))
vi.mock('$lib/state/global.svelte', () => ({
  getGlobalState: () => ({ userRegions: [{ permissions: viewer.permissions, regionFk: 1 }] }),
}))
const nav = vi.hoisted(() => ({ goto: vi.fn() }))
vi.mock('$lib/state/navigation.svelte', () => ({ push: nav.goto }))

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
  const value = {
    comments,
    eventId: 1,
    hasEarlier: false,
    highlightId: undefined,
    regionFk: 1,
  } as unknown as CommentThread
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

const placeholder = (removedBy: 'admin' | 'author', replies: CommentListItem[]): CommentListItem => ({
  ...comment(1, 10, replies),
  author: { id: 7, name: 'bo' },
  body: '…',
  mine: false,
  removedBy,
})

it.each([
  ['admin', 'Removed by a region admin'],
  ['author', 'Deleted by its author'],
] as const)('stands in for a root removed by its %s, without its author, keeping the replies', (removedBy, text) => {
  const { container } = render(Comments, { thread: thread([placeholder(removedBy, [comment(2, 20)])]).value })

  const [root, reply] = container.querySelectorAll('article')
  expect(root.textContent).toContain(text)
  expect(root.textContent).not.toContain('bo')
  expect(root.querySelector('time')).not.toBeNull()
  expect(root.querySelectorAll('button')).toHaveLength(0)
  expect(reply.textContent).not.toContain(text)
})

it('keeps the undo on a root its author just deleted, now that its replies hold it in place', async () => {
  const reply = { ...comment(2, 20), mine: false }
  const { comments, value } = thread([comment(1, 10, [reply])])
  render(Comments, { thread: value })

  await fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
  comments.data = [{ ...comment(1, 10, [reply]), removedBy: 'author' }]
  flushSync()

  expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)
  await fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(writes.restoreComment).toHaveBeenCalledWith(1)
})

const theirs = (id: number) => ({ ...comment(id, 10), author: { id: 7, name: 'bo' }, mine: false })

it.each([
  ['a maintainer', ['region.read', 'region.edit']],
  ['a member', ['region.read']],
])('offers %s no way to remove somebody else comment', (_, permissions) => {
  viewer.permissions = permissions
  render(Comments, { thread: thread([theirs(1)]).value })

  expect(screen.queryByRole('button', { name: 'Remove comment' })).toBeNull()
})

it('sends a region admin from somebody else comment to its removal page', async () => {
  viewer.permissions = ['region.read', 'region.edit', 'region.delete']
  render(Comments, { thread: thread([theirs(4), comment(5, 20)]).value })

  expect(screen.getAllByRole('button', { name: 'Remove comment' })).toHaveLength(1)
  await fireEvent.click(screen.getByRole('button', { name: 'Remove comment' }))
  expect(nav.goto).toHaveBeenCalledWith('/remove/comment/4')
})
