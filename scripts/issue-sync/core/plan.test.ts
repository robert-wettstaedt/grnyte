import { describe, expect, it } from 'vitest'
import { planComment, planFields, planFollowup, planStatus } from './plan'
import { MARKER } from './render'

const ME = 'sync-user'
const body = `${MARKER}\n### r1 · In progress`
const T = 1_000_000

describe('planComment', () => {
  it('creates the comment when the issue has none of its own', () => {
    expect(planComment([], ME, body, undefined, T)).toEqual({ kind: 'create' })
  })

  it('updates only its own marked comment, not a foreign one quoting the marker', () => {
    const existing = [
      { author: 'someone', body: `${MARKER}\nquoted`, id: 1 },
      { author: ME, body: `${MARKER}\nold`, id: 2 },
    ]

    expect(planComment(existing, ME, body, undefined, T)).toEqual({ id: 2, kind: 'update' })
  })

  it('skips when the comment already holds the body, so idle passes write nothing', () => {
    const existing = [{ author: ME, body, id: 2 }]

    expect(planComment(existing, ME, body, undefined, T)).toEqual({ kind: 'skip' })
    expect(planComment(existing, ME, body, T - 5_000, T)).toEqual({ kind: 'skip' })
  })

  it('defers, not drops, a write within a minute of the last one', () => {
    const existing = [{ author: ME, body: `${MARKER}\nold`, id: 2 }]

    expect(planComment(existing, ME, body, T - 20_000, T)).toEqual({ at: T + 40_000, kind: 'defer' })
  })
})

describe('planFields', () => {
  it('writes only the fields whose value differs', () => {
    expect(planFields({ Open: 3, Worktree: '1145-r1' }, { Open: 2, Worktree: '1145-r1' })).toEqual([
      { field: 'Open', value: 2 },
    ])
  })

  it('writes nothing when every field already matches', () => {
    expect(planFields({ Open: 2, Worktree: 'a' }, { Open: 2, Worktree: 'a' })).toEqual([])
  })
})

describe('planStatus', () => {
  const option = (id: string, name: string, state: 'CLOSED' | 'OPEN' = 'OPEN') => ({ id, name, state })
  const options = [option('s1', 'Todo'), option('s2', 'In progress'), option('s3', 'Done', 'CLOSED')]

  it('sets the wanted status on an open issue without one, or with another', () => {
    expect(planStatus({ isOpen: true, options }, 'In progress')).toEqual({ id: 's2', kind: 'set' })
    expect(planStatus({ isOpen: true, options, status: 'Todo' }, 'In progress')).toEqual({ id: 's2', kind: 'set' })
  })

  it('writes nothing when the issue already has it', () => {
    expect(planStatus({ isOpen: true, options, status: 'In progress' }, 'In progress')).toEqual({ kind: 'skip' })
  })

  it('leaves a closed issue alone, since an open status would reopen it', () => {
    expect(planStatus({ isOpen: false, options, status: 'Done' }, 'In progress')).toEqual({ kind: 'skip' })
  })

  it('never uses a status that closes the issue, even under the wanted name', () => {
    expect(planStatus({ isOpen: true, options: [option('s9', 'In review', 'CLOSED')] }, 'In review')).toEqual({
      kind: 'unavailable',
    })
  })

  it('says so when the repository has no statuses or not the wanted one', () => {
    expect(planStatus({ isOpen: true }, 'Todo')).toEqual({ kind: 'unavailable' })
    expect(planStatus({ isOpen: true, options }, 'Backlog')).toEqual({ kind: 'unavailable' })
  })
})

describe('planFollowup', () => {
  const issue = { body: 'follow-up to #1145', number: 1170 }

  it('adds a missing follow-up of this issue to the project', () => {
    expect(planFollowup(issue, 1145, { added: new Set(), onProject: false })).toBe('add')
  })

  it('never touches one already on the project, so its status stays the developer s', () => {
    expect(planFollowup(issue, 1145, { added: new Set([1170]), onProject: true })).toBe('skip')
  })

  it('never re-adds one the developer removed', () => {
    expect(planFollowup(issue, 1145, { added: new Set([1170]), onProject: false })).toBe('skip')
  })

  it('ignores an issue that is not a follow-up of this one, such as a typo in the number', () => {
    expect(
      planFollowup({ body: 'follow-up to #900', number: 1170 }, 1145, { added: new Set(), onProject: false }),
    ).toBe('skip')
    expect(
      planFollowup({ body: 'follow-up to #11450', number: 1170 }, 1145, { added: new Set(), onProject: false }),
    ).toBe('skip')
    expect(planFollowup({ body: 'Unrelated bug', number: 1 }, 1145, { added: new Set(), onProject: false })).toBe(
      'skip',
    )
  })
})
