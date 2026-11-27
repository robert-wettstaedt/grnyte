# Design

## Context

See proposal.md for why. Facts that shape the approach:

- Agents run in a sandbox without `git push`, so a branch's committed state lags its worktree by hours, and agents tick tasks far more often than they commit. The live backlog exists only in each worktree's `tasks.md`.
- File watching does not work from inside the sandbox (a sandboxed `vite dev` never saw edits), so the watcher runs as a `launchd` agent the developer installs.
- OpenSpec 1.17 parses changes. `openspec instructions apply --change <c> --json` returns every task as `id` (sequential, "1".."n"), `description` (keeping the "1.1" prefix), `done`, `sourcePath`, `line`, plus `progress`; it carries no task-group or heading information. `openspec status --change <c> --json` returns which artifacts exist. Both refuse an archived change ("not found"); archived changes live in `openspec/changes/archive/<date>-<name>/`. An unknown key in `.openspec.yaml` draws a warning unless prefixed `x-`, and `x-` keys survive every command including `archive` (tested in a scratch project). The CLI's JSON holds absolute paths (`changeDir`, `sourcePath`, `planningHome`).
- The roadmap is the private GitHub project `users/robert-wettstaedt/projects/2` over issues in the public repo. Issue and comment writes need a token with Issues write; project fields need a classic token with the `project` scope (fine-grained tokens cannot reach user-owned projects).
- GitHub has issue statuses in public preview (since November 2026): `Issue.status`, `Repository.planningStatuses` and `setIssueStatus`, which documents "closing or reopening it when the status calls for it". Each status has a category whose `state` is `OPEN` (Backlog, Todo, In progress, In review) or `CLOSED` (Done, Not planned, Duplicate). `planningStatuses` is null where statuses are unavailable; names cannot be customized yet. The issues token may read and set them: setting issue 1166 to In review kept it open, left the project's Status alone, and added no timeline entry or public event (checked 2026-11-25).
- GitHub documents that editing a comment to add a mention notifies the person, and that references (`#123`, `owner/repo#123`, `GH-123`, issue URLs) create backlinks. Comment edits produce no documented public event; a comment produces one only when created.
- Project skills live in `.agents/skills/<name>/` with a symlink `.claude/skills/<name>` (for example `.claude/skills/review-loop -> ../../.agents/skills/review-loop`); git records edits under `.agents/skills/`. The review loop has an implementation mode and a plan mode (`plan <change>`), each with its own Setup.
- `tsconfig.json` does not include `scripts/`, so `svelte-check` does not typecheck scripts today.
- Node 24 has `path.matchesGlob`, so globs need no package. `yaml` is installed only transitively; fallow reports an import of an unlisted package, so it becomes a direct devDependency.
- The app is untouched: no Zero queries, mutators, remote functions, routes, tables or schema changes.

## Goals / Non-Goals

**Goals:**

- One source of truth for a change's backlog (`tasks.md`), visible on its issue within about a minute.
- The sync can never mention anyone, backlink an issue, or publish text the privacy check rejects.
- Pure, tested core; thin, replaceable edges (watcher, `launchd`, Keychain, GitHub calls).

**Non-Goals:**

- Parsing task lines ourselves: OpenSpec's task list is the definition of a task. We read only headings (D2) and the markers in task descriptions (D4).
- Supporting machines other than the developer's Mac.

## Decisions

### D1. Location and shape: `scripts/issue-sync/`, pure core plus edges

Pure modules, each one of the agreed test seams:

- `collect.ts`: per-root change data in, `{ byIssue, unlinked }` out (S5).
- `progress.ts`: a change view and gate result in, the issue status name out (S3).
- `gate.ts`: a change's tasks and changed files in, `{ pass, failures, notes }` out (S4).
- `guard.ts`: strings and denylist in, `{ kept, withheld }` out (S2).
- `render.ts`: an issue and its change views in, the comment markdown out, including the reference rewrites and truncation (S1).
- `plan.ts`: existing comments, desired body and the issue's last write in, `create | update | skip` out; an issue's state and status, the repository's statuses and the wanted name in, the status id to set or the reason to skip out (S6).

Edges, not unit-tested: `openspec.ts` (runs the CLI, reads `.openspec.yaml` with `yaml` and `tasks.md` headings), `git.ts` (worktree roots, changed files), `github.ts` (runs `gh api`), `keychain.ts`, `watch.ts`, and the entry points `sync.ts`, `status.ts`, `gate-cli.ts`, `followup.ts`, `setup-project.ts`, run with `tsx` like `generate:powersync`. Tests run in the `server` vitest project via `NODE_ENVIRONMENT_TESTS`, like `vite.sync-engine.test.ts`. A standalone `scripts/issue-sync/tsconfig.json` (strict, `include: ["./**/*.ts"]`, Node types, not extending the root config, which pulls in `src/**` and `.svelte-kit`) is typechecked by `tsc --noEmit -p`, since the root `tsconfig.json` excludes `scripts/`.

Alternative: a separate package or a home-folder tool. Rejected: the conventions it enforces live in this repo, so its code is reviewed here.

### D2. OpenSpec CLI for tasks, headings by line

The edge runs `npx @fission-ai/openspec@<pinned> instructions apply|status --json` per active change, with the version pinned in one place. Task groups come from `tasks.md` headings: each task belongs to the nearest `## ` heading above its `line`. That is a heading lookup, not a task parser; which lines are tasks, and whether they are done, stays OpenSpec's answer. Test fixtures are recorded from the pinned CLI with every absolute path replaced by a placeholder before they are committed, so an OpenSpec upgrade that changes the JSON fails the tests and no local path reaches the public repo. The check is structural: no string value in a fixture starts with `/`, since sandbox paths hide the username as a `-Users-<name>-` segment that a `/Users/` search misses.

Archived changes are not asked of the CLI (it refuses them): a change counts as archived when `openspec/changes/archive/<date>-<name>/` exists in any root's working tree or in the fetched `origin/develop` (`git ls-tree`), so removing the worktree that archived it cannot bring an older copy back to life.

Alternative: parse `tasks.md` task lines with a regex. Rejected: two definitions of a task would drift.

### D3. Linking and scope: `x-issue` and `x-paths` in `.openspec.yaml`

`x-issue: 1145` (a number) and `x-paths` (globs, matched with `path.matchesGlob`). Several changes may name one issue. The same change in several roots resolves as: archived anywhere wins; otherwise the copy with more tasks done; then a root whose branch starts with `feature/<issue>-`; then the main checkout's; then the first root in `git worktree list` order.

Alternative: frontmatter in `proposal.md`. Also survives, but is not a convention OpenSpec names; `x-` is.

### D4. Discovered items: a section and three markers

`## Discovered` is an ordinary task group, so OpenSpec counts its items; D2's heading lookup tells them apart from spec tasks. A marker is the first token of the description: `[blocks-PR]`, `[later] #1170 ...`, `[you]`. An unmarked Discovered item counts as `[blocks-PR]`, so forgetting a marker blocks rather than hides.

### D5. Watcher: per-root `openspec/changes/`, debounce, periodic pass

`watch.ts` reads roots from `git worktree list --porcelain`, watches `<root>/openspec/changes/` recursively with `fs.watch`, maps an event path to its change, and debounces per change (30 s after the last event). A full pass runs at start, on wake (a gap of over two minutes between timer ticks), and hourly; it also refreshes the roots, so new worktrees join without a restart.

Alternative: a 15-minute poll. Rejected: up to 15 minutes stale for no saving.

### D6. Writes: one marked comment, the issue status, private fields, nothing else

The comment carries a hidden marker `<!-- grnyte:issue-sync v1 -->` as its first line; `plan.ts` only ever updates the comment that starts with it and was written by the token's own user, so a quoted marker in someone else's comment is ignored. Throttle and the equal-body check are per issue: at most one write per issue per minute, none when the rendered body is unchanged. A write that falls inside the minute is deferred, not dropped: the issue gets a timer for the end of its minute, and the latest body is written then. The body shows when each change's backlog last changed (stored in state when its rendered section changes), never when the sync last ran, so an idle pass renders an identical body and writes nothing; the watcher's own freshness shows in `issues:status`. Project writes (via the classic token): Worktree (text), Open tasks (number), and adding `[later]` issues. The sync reads the item first, writes a field only when its value differs, adds an issue only when it is missing, never writes the project's own Status field, and adds only issues whose body opens "follow-up to #", so a typo in a `[later]` number cannot pull an unrelated issue or PR onto the roadmap. With several active changes on one issue, Worktree lists their worktrees and Open tasks is the sum. Both fields are created once by `issues:setup-project`, not by the sync.

The issue status (via the issues token, D8) is read and written in its own request, separate from the project query, so the preview API changing cannot stop the comment or the fields. `plan.ts` skips a closed issue, an equal status, a repository without statuses, and a wanted name that is missing or whose category closes the issue; the last two are said in the log. A request that fails counts toward the three-failure notification after the comment and fields are written.

Alternative: a private Phase field on the project. Built first, before the preview was known; replaced because it duplicated the status, disagreed with it on the board, and does not show as an icon in the roadmap overview.

### D7. Rewrites and privacy

`render.ts` rewrites `@word` to `at word`, `#123`, `owner/repo#123` and `GH-123` to `issue 123` / `owner/repo issue 123`, and GitHub issue or PR URLs to `redirect.github.com`, the backlink-free form GitHub documents. `guard.ts` checks every published string, not only task items: change names, branch names, worktree names, group headings and task descriptions. It withholds strings matching email, token and key prefixes (`ghp_`, `github_pat_`, `sb_secret_`, `sb_publishable_`, JWTs), UUIDs, IPv4 addresses, absolute local paths (`/Users/`, `/private/`, `/tmp/`, `/var/folders/`) and any `-Users-<word>-` segment, and every denylist term case-insensitively; a withheld heading or name is replaced by "(withheld)". The denylist is `~/.config/grnyte/issue-sync.json`; without it the sync exits before any write.

### D8. Status derivation

Evaluated top to bottom, the first match wins:

- In review: the change is archived (D2). Archiving happens on the branch before the pull request merges, so it must not close the issue. Pull requests merge into `develop`, and GitHub closes issues by keyword only on merges into the default branch `main`, so the issue stays In review until a release or the developer closes it; GitHub then shows Done. Accepted: an issue whose only change is archived shows In review until then, even when a later change for it is still to be proposed.
- Backlog: the change has no `tasks.md`, or no tasks in it.
- In review: the gate passes (D9), which already allows open `[later]` items with their issue and open `[you]` items.
- Todo: no task is done.
- In progress: otherwise.

With several changes on one issue the least advanced wins, in the order Backlog, Todo, In progress, In review. The developer does not set these statuses by hand, so the derived one always wins on an open issue. An archived change's comment section says "Archived" in place of a status.

Open tasks counts every unchecked item, spec tasks and Discovered items of all markers, so deferred and waiting work stays visible as a number.

The plan review's own status is not an input: it lives in the review-loop skill, and a status must be derivable from the change alone.

### D9. Gate

`gate.ts` fails on: a missing `tasks.md`, an open spec task, an open `[blocks-PR]` (or unmarked Discovered) item, a `[later]` item without an issue number, a changed file outside `x-paths`. The change's own folder (`openspec/changes/<name>/**`) and archiving's paths (`openspec/changes/archive/**`, `openspec/specs/**`) always count as in scope. Changed files are `git diff --name-only $(git merge-base origin/develop HEAD)` plus uncommitted and untracked files in the worktree. Every git call the edges make runs with `GIT_OPTIONAL_LOCKS=0`, so a `git status` from the watcher never takes `index.lock` while an agent commits in that worktree. `issues:gate` fetches `develop` first when the network allows; the sync fetches once per full pass, not per gate evaluation, to keep `launchd` from writing to the shared `.git` on every debounce. `[you]` items and open `[later]` items with an issue are reported, not failures. A change without `x-paths` (every change created before this convention) skips the scope check with a note. The gate runs before archive; after archive the gate is not run.

The review loop runs `npm run issues:gate -- <change>` first in its implementation mode, and only when the work under review is an active OpenSpec change. Plan mode and reviews without a change skip it.

### D10. Credentials, state and failure

Tokens come from the Keychain at start (`security find-generic-password -s grnyte-issue-sync-issues -w` and `-s grnyte-issue-sync-project`), never from a file. State (the last body hash and write time per issue, the withheld log, the error count) lives in `~/Library/Application Support/grnyte-issue-sync/`, never in a worktree. After three consecutive failed runs the agent posts one macOS notification; `issues:status` shows the last error. The `launchd` plist sets `PATH` to include the Volta and Homebrew bin folders, since an agent inherits no shell profile and the edge calls `npx` and `gh`.

### D11. Follow-up issues

`issues:followup -- <parent> "<title>"` creates a follow-up issue: it runs the title through `guard.ts`, creates the issue with the body "follow-up to #<parent>" (an intended backlink) and prints the number for the `[later]` item. It uses only the issues token agents already have through `gh`; it never touches the project. The watcher adds the issue to the project on its next pass, because it sees the number in the `[later]` item, so agents never hold the classic `project` token. Agents use it instead of `gh issue create`, so every public text a change produces passes the same check.

### D12. Skills and rules

`/start-issue <n>` lives in `.agents/skills/start-issue/` with the symlink `.claude/skills/start-issue`, like every project skill. It builds on `EnterWorktree`, the only way a sandboxed session can create a worktree (`git worktree add` fails there because `.git/worktrees` is read-only): `EnterWorktree` with the name `<n>-<slug>`, then resets the new branch to `origin/develop` (EnterWorktree branches from `main`), renames it to `feature/<n>-<slug>`, and installs `node_modules` with `npm ci`. It writes `x-issue` and an initial `x-paths` of `[]` (the change's own folder is always in scope, D9; the agent adds code globs at propose time). It refuses only a change name already used by another worktree; a second change for the same issue is allowed, since several changes may serve one issue (D3). `EnterWorktree` with a name refuses inside a worktree session, so the skill runs from a session in the main checkout; started inside a worktree, it stops and says so before doing anything. The review-loop edit lands in `.agents/skills/review-loop/SKILL.md`. Whether the sandbox lets an agent write `.agents/skills/` is checked at apply time; if not, the developer or an unsandboxed session writes those two files. The four `AGENTS.md` rules are one or two lines each.

## Risks / Trade-offs

- [The privacy check misses prose PII such as a name] → The `AGENTS.md` rule is the primary defense; the check catches patterns and the denylist.
- [GitHub's notification behavior on edits is undocumented] → No mention or link can reach the text, so no edit can notify.
- [Missed file events, sleep, a crashed watcher] → Hourly and on-wake full passes; `launchd` `KeepAlive`; `issues:status` shows the last pass and error, and three failed runs post a notification.
- [The `launchd` agent cannot fetch (credentials under `launchd`)] → A failed fetch is a failed run, so it is reported; the gate then diffs against the last fetched `develop` and names that base.
- [Issue statuses are a preview and may change or disappear] → Separate request, matched by name and by an `OPEN` category, skipped when missing.
- [A status write closes or reopens an issue] → Only `OPEN` statuses, only on open issues; the remaining window is a close between the read and the write.
- [GitHub mirrors an issue status to a project Status option of the same name] → Wanted; the sync itself never writes the project's Status.
- [A wrong `x-issue` posts a backlog to an unrelated issue] → Writes only to issues on the roadmap project.
- [Task text is public before review] → It becomes public at merge anyway; the privacy rule and check apply before then.
- [OpenSpec CLI output changes on upgrade] → Pinned version; recorded fixtures fail the tests first.
- [`x-paths` too narrow early on] → Widening is a visible edit in the diff, which is the point.
- [A stale `origin/develop` widens the diff] → The gate fetches `develop` first when it can, and names the base it used.

## Migration Plan

1. Merge the change; run `issues:setup-project` to create the Worktree and Open tasks fields.
2. Store both tokens in the Keychain; write the denylist file.
3. Run `npm run issues:sync -- --once --dry-run` against the live worktrees and read the planned writes.
4. Run one real pass for a single issue and check its comment and fields on GitHub.
5. Install the `launchd` agent from the template.
6. Link the open changes (`x-issue`) and start the next roadmap item with `/start-issue`.
7. Delete the project's old Phase field by hand once this version runs.

Rollback: unload the agent; the comments and statuses stay as last written and can be changed by hand.
