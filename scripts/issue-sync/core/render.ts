import { openMarker } from './discovered'
import { isPrivate } from './guard'
import type { ChangeView, Status } from './types'

/** First line of the one comment the sync owns on an issue. */
export const MARKER = '<!-- grnyte:issue-sync v1 -->'

/** GitHub caps a comment at 65,536 characters; stay well below. */
const LIMIT = 60_000

export interface Section {
  change: ChangeView
  /** When this change's backlog last changed, already formatted; never when the sync last ran. */
  changedAt: string
  status: Status
}

export function renderComment(sections: Section[], denylist: string[]): string {
  const body = [
    MARKER,
    ...sections.flatMap((section, i) => [...(i > 0 ? [''] : []), ...renderSection(section, denylist)]),
  ].join('\n')
  if (body.length <= LIMIT) return body
  const name = sections[0]?.change.name ?? ''
  const where = isPrivate(name, denylist) ? "the change's `tasks.md`" : `\`openspec/changes/${name}/tasks.md\``
  const footer = `… truncated: see ${where}`
  const cut = body.slice(0, LIMIT - footer.length - 1)
  return `${cut.slice(0, cut.lastIndexOf('\n'))}\n${footer}`
}

export function renderSection({ change, changedAt, status }: Section, denylist: string[]): string[] {
  const shown = (text: string, format: (safe: string) => string) =>
    isPrivate(text, denylist) ? '(withheld)' : format(rewrite(text))
  const head = `### ${shown(change.name, (name) => `\`${name}\``)} · ${change.archived ? 'Archived' : status}`
  if (change.archived) return [head]

  const visible = change.tasks.filter((task) => !isPrivate(task.description, denylist))
  const withheld = change.tasks.length - visible.length
  const lines = [
    head,
    `Branch ${shown(change.branch, (branch) => `\`${branch}\``)} · backlog last changed ${changedAt}`,
  ]
  for (const [group, tasks] of Map.groupBy(visible, (task) => task.group)) {
    const open = tasks.filter((task) => !task.done)
    const title = shown(group, (safe) => safe)
    lines.push(
      '',
      open.length === 0 ? `**${title}** ✓` : `**${title}**`,
      ...open.map((task) => `- [ ] ${rewrite(task.description)}`),
    )
  }

  const done = change.tasks.filter((task) => task.done).length
  const blocking = change.tasks.filter((task) => openMarker(task)?.marker === 'blocks-PR').length
  const hidden = withheld === 0 ? '' : ` · ${withheld} item${withheld === 1 ? '' : 's'} withheld by the privacy check`
  lines.push('', `${done} of ${change.tasks.length} done · ${blocking} blocking${hidden}`)
  return lines
}

/** Words every mention and issue reference, and points issue URLs at the backlink-free host, so publishing notifies nobody. */
export function rewrite(text: string): string {
  return (
    text
      .replace(
        /(?:https?:\/\/(?:www\.)?|www\.)github\.com\/([\w.-]+\/[\w.-]+\/(?:issues|pull)\/\d+)/gi,
        'https://redirect.github.com/$1',
      )
      // GitHub links after markdown renders, so `_#12_` and `_@x_` link; no `\b`, which `_` defeats.
      .replace(/\b([\w.-]+\/[\w.-]+)#(\d+)(?!\d)/g, '$1 issue $2')
      .replace(/(^|[^A-Za-z0-9&/])#(\d+)(?!\d)/g, '$1issue $2')
      .replace(/(^|[^A-Za-z0-9])GH-(\d+)(?!\d)/g, '$1issue $2')
      // Emails never get here: the privacy check withholds them first.
      .replace(/(^|[^A-Za-z0-9])@([\w-]+)/g, '$1at $2')
  )
}
