import { describe, expect, it } from 'vitest'
import { gate } from './gate'
import type { ChangeView, TaskItem } from './types'

const task = (description: string, done = false, group = '1. Build'): TaskItem => ({ description, done, group })
const found = (description: string, done = false) => task(description, done, 'Discovered')

const change = (over: Partial<ChangeView>): ChangeView => ({
  archived: false,
  branch: 'feature/1145-r1',
  hasTasksFile: true,
  isMain: false,
  issue: 1145,
  name: 'r1',
  paths: ['scripts/issue-sync/**'],
  root: '/w',
  rootOrder: 1,
  tasks: [task('1.1 Write it', true)],
  ...over,
})

describe('gate', () => {
  it('passes a change with every task done and every file inside its paths', () => {
    expect(gate(change({}), ['scripts/issue-sync/sync.ts'])).toEqual({ failures: [], notes: [], pass: true })
  })

  it('fails without a tasks.md, and on a tasks.md with no tasks', () => {
    expect(gate(change({ hasTasksFile: false, tasks: [] }), []).failures).toEqual(['no tasks.md'])
    expect(gate(change({ tasks: [] }), []).failures).toEqual(['tasks.md lists no tasks'])
  })

  it('fails on an open spec task', () => {
    expect(gate(change({ tasks: [task('2.1 Ship it')] }), []).failures).toEqual(['open task: 2.1 Ship it'])
  })

  it('fails on an open blocking or unmarked discovered item, and on a deferred item without its issue', () => {
    const { failures, pass } = gate(
      change({
        tasks: [
          task('1.1 Write it', true),
          found('[blocks-PR] Fix the flaky check'),
          found('An unmarked finding'),
          found('[later] Verify on a phone'),
        ],
      }),
      [],
    )

    expect(pass).toBe(false)
    expect(failures).toEqual([
      'open blocking item: [blocks-PR] Fix the flaky check',
      'open blocking item: An unmarked finding',
      'deferred item without an issue: [later] Verify on a phone',
    ])
  })

  it('reports deferred items with their issue and items waiting on the developer without failing', () => {
    const result = gate(
      change({
        tasks: [task('1.1 Write it', true), found('[later] #1170 Verify on a phone'), found('[you] Approve the copy')],
      }),
      [],
    )

    expect(result).toEqual({
      failures: [],
      notes: ['deferred to issue 1170: [later] #1170 Verify on a phone', 'waiting on you: [you] Approve the copy'],
      pass: true,
    })
  })

  it('fails on a file outside the paths, but not on the change folder or what archiving writes', () => {
    const files = [
      'src/routes/landing/x.svelte',
      'openspec/changes/r1/tasks.md',
      'openspec/changes/r1/.openspec.yaml',
      'openspec/changes/archive/2026-11-20-r1/tasks.md',
      'openspec/specs/development/issue-sync/spec.md',
    ]

    expect(gate(change({}), files).failures).toEqual(['outside x-paths: src/routes/landing/x.svelte'])
  })

  it('skips the scope check for a change from before x-paths, and says so', () => {
    expect(gate(change({ paths: undefined }), ['src/anything.ts'])).toEqual({
      failures: [],
      notes: ['no x-paths declared: scope not checked'],
      pass: true,
    })
  })
})
