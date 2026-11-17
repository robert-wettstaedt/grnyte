import { describe, expect, it } from 'vitest'
import { MARKER, renderComment, rewrite, type Section } from './render'
import type { ChangeView, TaskItem } from './types'

const task = (description: string, done = false, group = '1. Build'): TaskItem => ({ description, done, group })

const change = (over: Partial<ChangeView>): ChangeView => ({
  archived: false,
  branch: 'feature/1145-r1',
  hasTasksFile: true,
  isMain: false,
  issue: 1145,
  name: 'r1',
  root: '/w',
  rootOrder: 1,
  tasks: [],
  ...over,
})

const section = (over: Partial<ChangeView>, status: Section['status'] = 'In progress'): Section => ({
  change: change(over),
  changedAt: '2026-11-17 14:05 UTC',
  status,
})

describe('rewrite', () => {
  it('words mentions and references so nobody is notified and nothing backlinks', () => {
    expect(rewrite('ask @someone about #1170, GH-12 and octo/repo#7')).toBe(
      'ask at someone about issue 1170, issue 12 and octo/repo issue 7',
    )
  })

  it('words mentions and references wrapped in markdown or after punctuation', () => {
    expect(rewrite('ask _@octocat_, -@a, .@b and +@c about _#12_ and (#13)')).toBe(
      'ask _at octocat_, -at a, .at b and +at c about _issue 12_ and (issue 13)',
    )
  })

  it('words repository and GH references wrapped in markdown', () => {
    expect(rewrite('see _o/r#12_ and _GH-13_')).toBe('see _o/r issue 12_ and _issue 13_')
  })

  it('points any spelling of a GitHub issue URL at the backlink-free host', () => {
    expect(
      rewrite('http://github.com/o/r/issues/5, https://www.GitHub.com/o/r/pull/6 and www.github.com/o/r/issues/7'),
    ).toBe(
      'https://redirect.github.com/o/r/issues/5, https://redirect.github.com/o/r/pull/6 and https://redirect.github.com/o/r/issues/7',
    )
  })

  it('points issue and pull request URLs at the backlink-free host', () => {
    expect(rewrite('see https://github.com/octo/repo/issues/9 and https://github.com/octo/repo/pull/3')).toBe(
      'see https://redirect.github.com/octo/repo/issues/9 and https://redirect.github.com/octo/repo/pull/3',
    )
  })
})

describe('renderComment', () => {
  it('shows open tasks by group, finished groups as done, discovered items and totals', () => {
    const body = renderComment(
      [
        section({
          tasks: [
            task('1.1 Write it', true),
            task('2.1 Ship it', false, '2. Ship'),
            task('2.2 Tell people', true, '2. Ship'),
            task('[blocks-PR] Fix the flaky check', false, 'Discovered'),
            task('[later] #1170 Verify on a phone', false, 'Discovered'),
          ],
        }),
      ],
      [],
    )

    expect(body).toBe(
      [
        MARKER,
        '### `r1` · In progress',
        'Branch `feature/1145-r1` · backlog last changed 2026-11-17 14:05 UTC',
        '',
        '**1. Build** ✓',
        '',
        '**2. Ship**',
        '- [ ] 2.1 Ship it',
        '',
        '**Discovered**',
        '- [ ] [blocks-PR] Fix the flaky check',
        '- [ ] [later] issue 1170 Verify on a phone',
        '',
        '2 of 5 done · 1 blocking',
      ].join('\n'),
    )
  })

  it('gives each change its own section, and shows an archived one as archived without its tasks', () => {
    const body = renderComment(
      [
        section({ name: 'r1-a', tasks: [task('1.1 One')] }, 'Todo'),
        section({ archived: true, name: 'r1-b' }, 'In review'),
      ],
      [],
    )

    expect(body).toBe(
      [
        MARKER,
        '### `r1-a` · Todo',
        'Branch `feature/1145-r1` · backlog last changed 2026-11-17 14:05 UTC',
        '',
        '**1. Build**',
        '- [ ] 1.1 One',
        '',
        '0 of 1 done · 0 blocking',
        '',
        '### `r1-b` · Archived',
      ].join('\n'),
    )
  })

  it('withholds private tasks with a count, and shows a private name or heading as withheld', () => {
    const body = renderComment(
      [
        section({
          branch: 'feature/zeus-mbp',
          tasks: [task('1.1 Copy /Users/x/y'), task('1.2 Fine'), task('1.3 Ok', false, 'zeus-mbp setup')],
        }),
      ],
      ['zeus-mbp'],
    )

    expect(body).toBe(
      [
        MARKER,
        '### `r1` · In progress',
        'Branch (withheld) · backlog last changed 2026-11-17 14:05 UTC',
        '',
        '**1. Build**',
        '- [ ] 1.2 Fine',
        '',
        '**(withheld)**',
        '- [ ] 1.3 Ok',
        '',
        '0 of 3 done · 0 blocking · 1 item withheld by the privacy check',
      ].join('\n'),
    )
  })

  it('truncates a backlog too large for one comment and points at the change folder', () => {
    const tasks = Array.from({ length: 3000 }, (_, i) => task(`1.${i} ${'x'.repeat(40)}`))
    const body = renderComment([section({ tasks })], [])

    expect(body.length).toBeLessThan(60_000)
    expect(body.endsWith('… truncated: see `openspec/changes/r1/tasks.md`')).toBe(true)
  })

  it('keeps a withheld change name out of the truncation footer', () => {
    const tasks = Array.from({ length: 3000 }, (_, i) => task(`1.${i} ${'x'.repeat(40)}`))
    const body = renderComment([section({ name: 'zeus-mbp-setup', tasks })], ['zeus-mbp'])

    expect(body).not.toContain('zeus-mbp')
    expect(body.endsWith("… truncated: see the change's `tasks.md`")).toBe(true)
  })
})
