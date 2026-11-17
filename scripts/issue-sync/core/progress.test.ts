import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GateResult } from './gate'
import { deriveStatus, openCount, rollUp } from './progress'
import { toTasks, type ApplyJson } from './tasks'
import type { ChangeView } from './types'

// The tasks.md each fixture was recorded from, so headings line up with OpenSpec's task lines.
const TASKS_MD: Record<string, string> = {
  'all-done':
    '# Tasks\n\n## 1. First group\n\n- [x] 1.1 Do the first thing\n\n## 2. Second group\n\n- [x] 2.1 Do the third thing\n',
  discovered:
    '# Tasks\n\n## 1. First group\n\n- [x] 1.1 Do the first thing\n\n## Discovered\n\n- [ ] [blocks-PR] Fix the flaky check\n- [ ] [later] #1170 Verify on a real phone\n- [ ] [you] Approve the copy\n- [ ] An unmarked finding\n',
  'partly-done':
    '# Tasks\n\n## 1. First group\n\n- [x] 1.1 Do the first thing\n- [x] 1.2 Do the second thing\n\n## 2. Second group\n\n- [ ] 2.1 Do the third thing\n',
  unchecked:
    '# Tasks\n\n## 1. First group\n\n- [ ] 1.1 Do the first thing\n- [ ] 1.2 Do the second thing\n\n## 2. Second group\n\n- [ ] 2.1 Do the third thing\n',
}

const fromFixture = (name: string, over: Partial<ChangeView> = {}): ChangeView => {
  const { apply } = JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf8')) as {
    apply: ApplyJson
  }
  const tasksMd = TASKS_MD[name]
  return {
    archived: false,
    branch: 'feature/1145-r1',
    hasTasksFile: tasksMd != null,
    isMain: false,
    issue: 1145,
    name,
    root: '/w',
    rootOrder: 1,
    tasks: tasksMd == null ? [] : toTasks(apply, tasksMd),
    ...over,
  }
}

const passing: GateResult = { failures: [], notes: [], pass: true }
const failing: GateResult = { failures: ['outside x-paths: src/x.ts'], notes: [], pass: false }

describe('toTasks', () => {
  it('puts each task under the heading above its line', () => {
    expect(fromFixture('discovered').tasks.map((task) => [task.group, task.done])).toEqual([
      ['1. First group', true],
      ['Discovered', false],
      ['Discovered', false],
      ['Discovered', false],
      ['Discovered', false],
    ])
  })
})

describe('deriveStatus', () => {
  it('is In review once archived, whatever else holds, so the issue stays open until the release', () => {
    expect(deriveStatus(fromFixture('partly-done', { archived: true }), failing)).toBe('In review')
  })

  it('is Backlog without tasks, even when the gate would pass', () => {
    expect(deriveStatus(fromFixture('no-tasks'), passing)).toBe('Backlog')
    expect(deriveStatus(fromFixture('all-done', { tasks: [] }), passing)).toBe('Backlog')
  })

  it('is In review when the gate passes, with deferred and waiting items still open', () => {
    expect(deriveStatus(fromFixture('all-done'), passing)).toBe('In review')
    expect(deriveStatus(fromFixture('discovered'), passing)).toBe('In review')
  })

  it('is Todo while no task is done', () => {
    expect(deriveStatus(fromFixture('unchecked'), failing)).toBe('Todo')
  })

  it('is In progress once work started, including all done but the gate failing', () => {
    expect(deriveStatus(fromFixture('partly-done'), failing)).toBe('In progress')
    expect(deriveStatus(fromFixture('all-done'), failing)).toBe('In progress')
  })
})

describe('openCount', () => {
  it('counts every unchecked item, deferred and waiting ones included', () => {
    expect(openCount(fromFixture('discovered'))).toBe(4)
  })
})

describe('rollUp', () => {
  it('takes the least advanced status and sums the open items', () => {
    expect(
      rollUp([
        { open: 0, status: 'In review' },
        { open: 3, status: 'In progress' },
        { open: 2, status: 'Todo' },
      ]),
    ).toEqual({ open: 5, status: 'Todo' })
  })

  it('puts Backlog first', () => {
    expect(
      rollUp([
        { open: 1, status: 'Todo' },
        { open: 0, status: 'Backlog' },
      ]),
    ).toEqual({ open: 1, status: 'Backlog' })
  })
})
