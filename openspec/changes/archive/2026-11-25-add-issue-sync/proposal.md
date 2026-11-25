# Proposal

## Why

Several agents work in parallel, each in its own worktree on an OpenSpec change, and the developer cannot see their backlogs: tasks found mid-work live only in the conversation, one agent may span several worktrees, and the first sign of open work is an agent saying "ten things first" when a PR is due. The roadmap now lives in a private GitHub project over public issues, so the place to see each change's backlog is the issue it serves.

## What Changes

- An OpenSpec change names its roadmap issue as `x-issue: <n>` in `.openspec.yaml` (OpenSpec's sanctioned prefix for tool metadata; an unprefixed key draws a warning) and the paths it may touch as `x-paths` globs.
- `tasks.md` gains a `## Discovered` section for work found while applying, each item marked `[blocks-PR]`, `[later]` (with its follow-up issue) or `[you]`.
- A file watcher on the developer's Mac (`launchd`, outside the agent sandbox) syncs every linked change's open tasks to its issue, debounced per change, with a periodic full pass:
  - one comment per issue, edited in place, listing each linked change's open tasks by group, its Discovered items and totals;
  - the issue's GitHub status (Backlog, Todo, In progress or In review), derived from the change itself;
  - the private project's Worktree and Open tasks fields;
  - follow-up issues named by `[later]` items added to the project.
- Before any write, a privacy guard withholds every published string (task texts, headings, change, branch and worktree names, follow-up titles) that matches personal or environment patterns (generic patterns plus a private denylist outside the repo), and the renderer rewrites `@` and issue references so the comment can never mention anyone or backlink an issue.
- `issues:followup` creates a `[later]` item's follow-up issue through the same guard and adds it to the project.
- A gate (`issues:gate`) fails while a spec task or `[blocks-PR]` item is open, a `[later]` item lacks an issue, or the diff touches files outside `x-paths`. The review loop runs it first when it reviews an active change's implementation, not in plan mode; the sync shows a change that passes it as In review.
- `issues:status` prints the same per-issue view locally, with unlinked changes and withheld items.
- A `/start-issue <n>` skill creates the worktree and branch named after the issue and writes the link.
- `AGENTS.md` gains four rules: capture discovered work in `tasks.md` or a follow-up issue, keep personal and environment details out of everything written, stay inside `x-paths`, start roadmap work with `/start-issue`.

## Capabilities

### New Capabilities

- `development/issue-sync`: how a change's backlog reaches its roadmap issue and project, what may be published, and when a change counts as ready for a pull request.

### Modified Capabilities

(none)

## Non-goals

- Agents pushing branches or opening pull requests. A later change, behind a ruleset protecting `main` and `develop`.
- A GitHub Action or any server-side sync. The watcher runs where the worktrees are.
- Two-way sync. Nothing on GitHub flows back into `tasks.md`.
- Closing or reopening issues. A release pull request into `main` (the default branch) that says "Closes #n", or the developer, closes them, as today; GitHub then shows them as Done. Pull requests into `develop` close nothing.
- One issue per task, or sub-issues per task group.
- Tracking changes that name no issue beyond listing them in `issues:status`.

## Impact

- New: `scripts/issue-sync/` (core modules, the `openspec`, `git`, `github`, `keychain` and `watch` edges, entry points, fixtures, tests, its own `tsconfig.json`, a `launchd` plist template, a README); npm scripts `issues:sync`, `issues:status`, `issues:gate`, `issues:followup`, `issues:setup-project`, `issues:typecheck`; the skill `.agents/skills/start-issue/` with its symlink `.claude/skills/start-issue`.
- Modified: `AGENTS.md` (four rules), `.agents/skills/review-loop/SKILL.md` (gate first in implementation mode), `vite.config.ts` (`NODE_ENVIRONMENT_TESTS`), `.fallowrc.jsonc` (entry points), `package.json` and `package-lock.json` (scripts, `yaml` as a direct devDependency).
- GitHub: one comment per linked issue in `robert-wettstaedt/grnyte`; the status of each open linked issue; two fields (Worktree, Open tasks) on the private project.
- Outside the repo: `~/.config/grnyte/issue-sync.json` (denylist), Keychain entries for the two tokens, the installed `launchd` agent.
- No app code, routes, remote functions, tables or entity modules change; nothing is client-breaking.
