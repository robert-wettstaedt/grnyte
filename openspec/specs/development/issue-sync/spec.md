# development/issue-sync Specification

## Purpose

Makes every agent's backlog visible on the roadmap issue it serves, decides what of it may be published in a public repository, and defines when a change is ready for a pull request.

## Requirements

### Requirement: A change names its issue and its paths

An OpenSpec change that serves a roadmap issue SHALL name it as `x-issue` in its `.openspec.yaml`, and SHOULD list the paths it may touch as `x-paths` globs. Several changes MAY name the same issue. A change without `x-issue` SHALL NOT be written to GitHub.

#### Scenario: Linked change

- **WHEN** a change's `.openspec.yaml` holds `x-issue: 1145`
- **THEN** its backlog appears on issue #1145 and nowhere else on GitHub

#### Scenario: Unlinked change

- **WHEN** a change names no issue
- **THEN** nothing about it is written to GitHub, and the local status view lists it as unlinked

### Requirement: Work found while applying is recorded in the change

Work an agent discovers while applying a change SHALL be recorded before it is acted on: inside the change's scope as an item under `## Discovered` in its `tasks.md`, marked `[blocks-PR]`, `[later]` or `[you]`; outside the scope as a follow-up issue. A `[later]` item SHALL name its follow-up issue. A follow-up issue SHALL be created through the same privacy check as the sync, with a body that opens "follow-up to #<n>".

#### Scenario: Deferred item

- **WHEN** an agent defers a verification until after the merge
- **THEN** `tasks.md` holds it as a `[later]` item naming a new issue that opens with "follow-up to #<n>", and the next sync adds that issue to the roadmap project

### Requirement: The issue shows the change's open backlog

For each issue named by at least one change, the sync SHALL keep exactly one comment that lists, per linked change: its name, branch and status (or that it is archived); its open tasks grouped by task group, with finished groups shown as done; its Discovered items with their markers; the totals; and when its backlog last changed. The sync SHALL update that comment within about a minute of a change to `tasks.md` while the developer's machine is awake, and SHALL catch up on start, on wake and at least hourly.

#### Scenario: Tasks ticked in a burst

- **WHEN** an agent ticks ten tasks within thirty seconds
- **THEN** the issue's comment is edited once, after the burst, and shows the remaining open tasks

#### Scenario: Two changes, one issue

- **WHEN** two changes name issue #1145
- **THEN** its single comment has one section per change, and the comment is written at most once a minute

#### Scenario: Archived change

- **WHEN** a linked change is archived in any checkout, while an older worktree still holds it unarchived
- **THEN** its section shows it as archived, and the sync stops listing its tasks

### Requirement: The sync edits only its own comment

The sync SHALL write only to issues in this repository that are on the roadmap project and named by a change. It SHALL create at most one comment per issue and afterwards only edit that comment, at most once a minute per issue. It SHALL NOT add labels, open or close an issue, or touch other comments.

#### Scenario: Comment already current

- **WHEN** a sync finds the comment already holds the body it would write
- **THEN** it makes no request that changes anything

### Requirement: Published text mentions and links nobody

Published text SHALL contain no `@` mention and no issue or pull-request reference that GitHub links. Mentions SHALL be reworded; `#123`, `owner/repo#123` and `GH-123` references SHALL be written as words; issue URLs SHALL use their backlink-free form.

#### Scenario: Task text with a mention and references

- **WHEN** an open task reads "ask @someone about #1170 and GH-12"
- **THEN** the comment shows it as "ask at someone about issue 1170 and issue 12"

### Requirement: Nothing personal or environment-specific is published

Before any write, every string the sync or the follow-up command would publish (task texts, group headings, change, branch and worktree names, issue titles) SHALL pass a privacy check against generic patterns (email addresses, tokens and keys, UUIDs, IP addresses, local user paths) and a denylist kept outside the repository. Matches SHALL be logged locally only. The sync SHALL refuse to run without its denylist.

#### Scenario: Missing denylist

- **WHEN** the denylist file does not exist
- **THEN** the sync writes nothing and reports why

### Requirement: What fails the privacy check is withheld, not published

A task that fails the privacy check SHALL be left out, and the comment SHALL say how many were withheld without showing them. A heading or name that fails SHALL be shown as "(withheld)". A follow-up issue whose title fails SHALL NOT be created.

#### Scenario: A task names a local path

- **WHEN** an open task contains a `/Users/` path
- **THEN** the comment omits that task, says one item was withheld, and the local status view shows which one

#### Scenario: A follow-up title names a hostname on the denylist

- **WHEN** an agent asks for a follow-up issue whose title contains a denylisted term
- **THEN** no issue is created and the command says why

### Requirement: The issue status shows each change's progress

The sync SHALL set the status of each open linked issue from the change itself, to the first that applies of: In review once the change is archived, Backlog while the change has no tasks, In review once the gate passes, Todo while no task is done, In progress otherwise. It SHALL write a status only when it differs from the issue's. It SHALL set, on the private roadmap project, the linked issue's Worktree and Open tasks. Open tasks SHALL count every unchecked item.

#### Scenario: All tasks done but a file outside the change's paths

- **WHEN** every task of a change is checked but its diff touches a file outside its `x-paths`
- **THEN** its status stays In progress

#### Scenario: Only deferred work left

- **WHEN** every spec task is done and the only open items are a `[later]` item with its issue and a `[you]` item
- **THEN** its status is In review and Open tasks is 2

### Requirement: A status write never opens or closes an issue

The sync SHALL set only statuses that keep an issue open, and SHALL NOT set the status of a closed issue. When the repository offers no statuses, or none with the wanted name that keeps the issue open, the sync SHALL leave the status alone and say so in its log. A status that cannot be read or written SHALL NOT keep the comment or the project fields from being written.

#### Scenario: Archived before the merge

- **WHEN** a linked change is archived on its branch and the pull request is not merged
- **THEN** its issue shows In review and stays open

#### Scenario: Closed issue

- **WHEN** a linked issue is closed while a change that names it still has open tasks
- **THEN** the sync leaves its status alone, so the issue stays closed

#### Scenario: Statuses unavailable

- **WHEN** the repository offers no issue statuses
- **THEN** the sync still writes the comment, Worktree and Open tasks, and its log says the status was skipped

### Requirement: Project writes never undo the developer's edits

A follow-up issue named by a `[later]` item SHALL be added to the project only when it is missing and its body opens "follow-up to #". The project's own Status field SHALL NOT be written, and a field SHALL be written only when its value differs.

#### Scenario: Follow-up already moved on

- **WHEN** a follow-up issue is already on the project with Status In Progress
- **THEN** the sync leaves its Status alone on every pass

### Requirement: Several changes on one issue roll up

When several active changes name one issue, its status SHALL be the least advanced of theirs (Backlog, Todo, In progress, In review), its Worktree SHALL list all their worktrees, and its Open tasks SHALL be their sum.

#### Scenario: One change ready, one applying

- **WHEN** issue #1145 has one change In review and another In progress
- **THEN** its status is In progress and its Open tasks is the sum of both

### Requirement: A change is ready for a pull request only when nothing blocks it

The gate SHALL fail, naming each reason, when an active change has no `tasks.md`, an unchecked spec task, an unchecked `[blocks-PR]` or unmarked Discovered item, a `[later]` item without an issue, or a file in its diff outside its `x-paths`. The diff SHALL be taken against the branch the change merges into, as last fetched, plus uncommitted and untracked files. Paths written by archiving SHALL count as in scope. `[you]` items SHALL be reported without failing it.

#### Scenario: Open deferred work with its issue

- **WHEN** all spec tasks are done and the only open item is `[later]` naming #1170
- **THEN** the gate passes and reports the deferred item

#### Scenario: A change from before this convention

- **WHEN** a change declares no `x-paths`
- **THEN** the gate skips the scope check and says so, and still checks its tasks

### Requirement: The review loop gates implementation reviews only

The review loop SHALL run the gate first when it reviews the implementation of an active change, and SHALL stop if the gate fails. It SHALL NOT run the gate in plan mode or for work without a change.

#### Scenario: Plan review

- **WHEN** the review loop reviews a change's plan before any task is done
- **THEN** the gate is not run
