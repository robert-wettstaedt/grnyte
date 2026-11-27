import { describe, expect, it } from 'vitest'
import { collect } from './collect'
import type { ChangeCopy } from './types'

const copy = (over: Partial<ChangeCopy>): ChangeCopy => ({
  archived: false,
  branch: 'feature/other',
  hasTasksFile: true,
  isMain: false,
  issue: 1145,
  name: 'r1',
  root: '/w/a',
  rootOrder: 1,
  tasks: [],
  ...over,
})

const done = (n: number, open = 0) => [
  ...Array.from({ length: n }, (_, i) => ({ description: `${i + 1} done`, done: true, group: '1. Group' })),
  ...Array.from({ length: open }, (_, i) => ({ description: `${i + 1} open`, done: false, group: '1. Group' })),
]

describe('collect', () => {
  it('lists several changes under one issue, by name', () => {
    const { byIssue } = collect([copy({ name: 'r1-writes' }), copy({ name: 'r1-reads', root: '/w/b' })])

    expect(byIssue.get(1145)?.map((view) => view.name)).toEqual(['r1-reads', 'r1-writes'])
  })

  it('treats a change archived anywhere as archived, even where an older worktree still holds it', () => {
    const { byIssue } = collect([
      copy({ root: '/w/old', tasks: done(3) }),
      copy({ archived: true, isMain: true, root: '/w/main', tasks: done(1, 2) }),
    ])

    expect(byIssue.get(1145)?.[0]).toMatchObject({ archived: true, root: '/w/main' })
  })

  it('prefers the copy with more tasks done', () => {
    const { byIssue } = collect([
      copy({ isMain: true, root: '/w/main', tasks: done(1, 3) }),
      copy({ root: '/w/b', rootOrder: 2, tasks: done(3, 1) }),
    ])

    expect(byIssue.get(1145)?.[0].root).toBe('/w/b')
  })

  it('on a tie prefers the worktree on the issue branch, then the main checkout, then worktree order', () => {
    const tied = [
      copy({ isMain: true, root: '/w/main', rootOrder: 0, tasks: done(1) }),
      copy({ branch: 'feature/1145-r1', root: '/w/issue', rootOrder: 3, tasks: done(1) }),
      copy({ root: '/w/first', rootOrder: 1, tasks: done(1) }),
    ]

    expect(collect(tied).byIssue.get(1145)?.[0].root).toBe('/w/issue')
    expect(collect(tied.slice(0, 1).concat(tied.slice(2))).byIssue.get(1145)?.[0].root).toBe('/w/main')
    expect(
      collect(tied.slice(2).concat(copy({ root: '/w/later', rootOrder: 5, tasks: done(1) }))).byIssue.get(1145)?.[0]
        .root,
    ).toBe('/w/first')
  })

  it('keeps changes without an issue apart', () => {
    const { byIssue, unlinked } = collect([copy({ issue: undefined, name: 'no-link' }), copy({ name: 'linked' })])

    expect(unlinked.map((view) => view.name)).toEqual(['no-link'])
    expect([...byIssue.keys()]).toEqual([1145])
  })
})
