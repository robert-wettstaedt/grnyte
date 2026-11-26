import '$lib/forms/screen.fixture'
import type { NotificationListItem } from '$lib/entities/notification/dto'
import type { QueryPhase } from '$lib/zero/resource.svelte'
import { render } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { beforeEach, expect, it, vi } from 'vitest'
import Page from './+page.svelte'

const inbox = $state({ data: [] as NotificationListItem[], phase: { kind: 'loading' } as QueryPhase })
const sync = $state({ caughtUp: true, user: { id: 3 } as undefined | { id: number } })
const marks = vi.hoisted(() => [] as (number | undefined)[])

vi.mock('$env/dynamic/public', () => ({ env: {} }))
vi.mock('$lib/entities/notification/resources.svelte', () => ({ notificationList: () => inbox }))
vi.mock('$lib/entities/notification/writes', () => ({
  markNotificationsRead: async (userId: number | undefined) => {
    marks.push(userId)
  },
}))
vi.mock('$lib/zero/source.svelte', async (original) => ({
  ...(await original<object>()),
  syncCaughtUp: () => sync.caughtUp,
}))
vi.mock('$lib/state/global.svelte', () => ({
  getGlobalState: () => ({
    get user() {
      return sync.user
    },
    userRegions: [{ permissions: [], regionFk: 1 }],
  }),
}))

const row = (id: number, readAt?: number): NotificationListItem => ({
  actorFk: 2,
  actorName: 'Bo',
  createdAt: Date.now() - id * 60_000,
  decisionFk: undefined,
  entity: undefined,
  eventFk: undefined,
  id,
  metadata: undefined,
  object: undefined,
  reactionFk: undefined,
  readAt,
  regionFk: 1,
  sourceType: 'mention',
})

const answer = (rows: NotificationListItem[], kind: 'answered' | 'arriving' = 'answered') => {
  inbox.data = rows
  inbox.phase = kind === 'answered' ? { empty: rows.length === 0, kind } : { kind }
  flushSync()
}

// The row's highlight is the only place "new" shows.
const newRows = (container: HTMLElement) =>
  [...container.querySelectorAll('article')].filter((article) => article.className.includes('border-primary-500'))
    .length

beforeEach(() => {
  inbox.data = []
  inbox.phase = { kind: 'loading' }
  marks.length = 0
  sync.caughtUp = true
  sync.user = { id: 3 }
})

it('keeps showing as new what was unread when the inbox first answered, after it comes back read', () => {
  const { container } = render(Page)

  answer([row(1), row(2), row(3, Date.now())])
  expect(newRows(container)).toBe(2)

  answer([row(1, Date.now()), row(2, Date.now()), row(3, Date.now())])
  expect(newRows(container)).toBe(2)
})

it('marks once the rows are on screen, not while the inbox loads', () => {
  render(Page)
  expect(marks).toEqual([])

  answer([row(1)])
  expect(marks).toEqual([3])
})

it('marks on leaving when no row was shown', () => {
  const { unmount } = render(Page)

  unmount()
  expect(marks).toEqual([3])
})

it('sends no mark while the inbox is still loading, whatever changes meanwhile', () => {
  render(Page)

  inbox.phase = { kind: 'loading' }
  flushSync()
  expect(marks).toEqual([])
})

it('waits for the sync to catch up before marking from rows on screen', () => {
  sync.caughtUp = false
  render(Page)

  answer([row(1)], 'arriving')
  expect(marks).toEqual([])

  sync.caughtUp = true
  flushSync()
  expect(marks).toEqual([3])
})

it('waits for the user row before marking, so the mark names the reader', () => {
  sync.user = undefined
  render(Page)

  answer([row(1)])
  expect(marks).toEqual([])

  sync.user = { id: 3 }
  flushSync()
  expect(marks).toEqual([3])
})

it('marks once per visit, however many rows arrive and when it leaves', () => {
  const { unmount } = render(Page)

  answer([row(1)])
  answer([row(0), row(1, Date.now())])
  unmount()
  expect(marks).toEqual([3])
})
