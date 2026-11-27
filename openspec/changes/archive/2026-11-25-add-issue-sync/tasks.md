# Tasks

Test seams, each test seen red once by the one production edit that should break it:

- S1 `render.ts`: grouping by task group with finished groups collapsed, Discovered markers and totals, the `@` / `#123` / `owner/repo#123` / `GH-123` / URL rewrites, one section per change, an archived section, the withheld line and "(withheld)" names, truncation.
- S2 `guard.ts`: withheld for an email, `ghp_`/`github_pat_`/`sb_secret_` tokens, a JWT, a UUID, an IPv4, `/Users/`, `/private/`, `/tmp/` and `/var/folders/` paths, a `-Users-<name>-` segment, a denylist term in any case; kept for "route 203", "1.27.2", "2026-11-17", "`src/lib/**`", "#1145".
- S3 `progress.ts` (group 8; `phase.ts` before it): In review once archived, Backlog (even with the gate passing), In review (including with an issued `[later]` and a `[you]` item open), Todo, In progress (including all tasks done but the gate failing); the open-items count; the roll-up of several changes (least advanced status, summed Open tasks).
- S4 `gate.ts`: fails on a missing `tasks.md`, an open spec task, an open `[blocks-PR]` or unmarked Discovered item, `[later]` without an issue, a file outside `x-paths`; passes with `[you]` and issued `[later]` items open; the change's own folder and archive paths in scope; no `x-paths` gives a note, not a failure.
- S5 `collect.ts`: several changes per issue, archived in any root or in `origin/develop` wins, most progressed next, then the root on `feature/<issue>-`, then main checkout, then worktree order; unlinked changes.
- S6 `plan.ts`: create, update only the own marked comment (not a foreign comment quoting the marker), skip on an equal body (two idle passes in a row write nothing), defer (not drop) a write within a minute of the issue's last write; for project items, add only a missing follow-up issue, write only changed fields; for the issue status (group 8), set it when it differs, skip a closed issue, an equal status, no statuses at all, a missing name, and a name whose category closes the issue.

Not unit-tested: the watcher, `launchd`, the Keychain and GitHub calls; checked by the dry run and the live pass in 6.4.

## 1. Fixtures and the change model

- [x] 1.1 Pin the OpenSpec CLI version in one constant and record fixtures from it in a scratch project: `status --json` and `instructions apply --json` for a change with no tasks, unchecked tasks, partly done, all done, and one with a `## Discovered` section; replace every absolute path in them with a placeholder before saving. Verify: fixture files under `scripts/issue-sync/fixtures/` hold real CLI output with the version stamped, and a test asserts that no string value in any fixture starts with `/`.
- [x] 1.2 Add `yaml` as a direct devDependency (`npm install -D yaml`, updating `package-lock.json`); add `scripts/issue-sync/**/*.test.ts` to `NODE_ENVIRONMENT_TESTS` in `vite.config.ts`, the entry points to `.fallowrc.jsonc`, and a standalone `scripts/issue-sync/tsconfig.json` (strict, `include: ["./**/*.ts"]`, Node types, not extending the root) with an `issues:typecheck` npm script (`tsc --noEmit -p scripts/issue-sync`). Verify: a placeholder test that imports `yaml` and `node:path` runs in `npx vitest run --project server scripts/issue-sync`; `npm run issues:typecheck` passes; `npm run lint:unused` green.
- [x] 1.3 `collect.ts` (S5), test first, from per-root change data (name, `x-issue`, `x-paths`, apply JSON, task groups, archived flag). Verify: `scripts/issue-sync/collect.test.ts` green, seen red.

## 2. Gate and phase

- [x] 2.1 `gate.ts` (S4), test first. Verify: `gate.test.ts` green, seen red.
  - Apply note: a `tasks.md` with headings but zero tasks also fails the gate (the spec says "no tasks"); add that case to S4.
- [x] 2.2 `phase.ts` (S3), test first, from the 1.1 fixtures and a gate result. Verify: `phase.test.ts` green, seen red.
  - Apply note: a change with zero tasks is Proposing; add that case to S3.
- [x] 2.3 Edges `openspec.ts` (pinned CLI, `.openspec.yaml` via `yaml`, `tasks.md` headings by line, archive folders) and `git.ts` (roots from `git worktree list --porcelain`, changed files against the fetched merge-base with `origin/develop` plus uncommitted and untracked, archive folders in `origin/develop`), every git call with `GIT_OPTIONAL_LOCKS=0`. Verify: a throwaway script prints this change's tasks with their groups and its changed files.
  - Apply note: the throwaway script also lists the archive folders found in `origin/develop` and shows the environment each git call ran with (`GIT_OPTIONAL_LOCKS=0`).
- [x] 2.4 `gate-cli.ts` and the `issues:gate` npm script. Verify: `npm run issues:gate -- add-issue-sync` in this worktree lists its open tasks as failures and exits non-zero.

## 3. What may be published

- [x] 3.1 `guard.ts` (S2), test first, with a test denylist. Verify: `guard.test.ts` green, seen red.
  - Apply note: narrowed after the first status run withheld 11 harmless tasks: a key prefix counts only with 20+ characters after it (`sb_secret_test` is a placeholder), and loopback and the RFC 5737 documentation ranges are not addresses to hide. Both cases are in S2.
- [x] 3.2 `render.ts` (S1), test first: the marker line, sections, rewrites, withheld line and names, truncation. Verify: `render.test.ts` green, seen red; the expected bodies are hand-written literals.

## 4. Writing to GitHub

- [x] 4.1 `plan.ts` (S6), test first. Verify: `plan.test.ts` green, seen red.
  - Apply note: widen D1's `plan.ts` contract to what S6 needs: a deferred outcome for comments, and the project-item rules (add only if missing, write only changed fields, leave Status alone).
- [x] 4.2 Edges `keychain.ts` (both tokens, `grnyte-issue-sync-issues` and `grnyte-issue-sync-project`) and `github.ts` (list, create and edit the marked comment; check an issue is on the roadmap project). Verify: `issues:sync -- --once --dry-run` prints the comment requests for one linked change and makes none.
  - Apply note: when a Keychain item is missing, `keychain.ts` falls back to `GH_TOKEN` / `GH_PROJECT_TOKEN`, so a dry run works from a shell before the Keychain is set up.
- [x] 4.3 Project writes in `github.ts`: set Phase, Worktree and Open tasks, add issues as Todo. Verify: `--dry-run` prints them; the live check is 6.4.
  - Apply note: record in state which follow-ups were added and never re-add one the developer removed from the project; accept a follow-up only when its body names the change's own `x-issue` as parent.
- [x] 4.4 `setup-project.ts` and `issues:setup-project`: create Phase (Proposing, Planned, Applying, Ready, Done), Worktree and Open tasks if missing. Verify: run once against the project; a second run reports nothing to do.
- [x] 4.5 `followup.ts` and `issues:followup -- <parent> "<title>"`, using only the issues token through `gh`: guard the title, create the issue with "follow-up to #<parent>", print its number; the sync adds it to the project. Verify from inside the agent sandbox: a title with a `/Users/` path is refused; a clean title creates one issue; after the next sync pass it is on the project as Todo.
  - Apply note: run from inside the sandbox, `issues:followup -- 1166` created issue 1167, the follow-up for 6.2; the next pass added it to the project as Todo.

## 5. Sync, status and the watcher

- [x] 5.1 `sync.ts` with `--once`, `--dry-run` and `--issue <n>` (limit a pass to one issue): one fetch of `develop` per pass, then collect, gate, phase, guard, render, plan, write; state, including each section's last-changed time, under `~/Library/Application Support/grnyte-issue-sync/`; refuse without `~/.config/grnyte/issue-sync.json`. Verify: a dry run without the denylist exits with that reason; with it, prints the planned writes for every linked change; `--issue` limits them to one.
  - Apply note: a failed fetch counts toward the three-failure notification but does not stop the pass; the gate then uses the last fetched `develop` and names that base.
- [x] 5.2 `status.ts` and `issues:status`: the per-issue view, unlinked changes, withheld items and the last error, without writing. Verify: output lists `add-issue-sync` as unlinked until it gets an issue.
- [x] 5.3 `watch.ts`: per-root `openspec/changes/` watches, 30 s debounce per change, full pass at start, on wake and hourly, roots refreshed on each pass, three-failure notification. Verify (outside the sandbox): editing a linked `tasks.md` updates the issue comment within a minute; ticking ten tasks in a burst edits it once.
  - Apply note: checked under `launchd`: linking this change to issue 1166 posted its comment 35 s after the edit, with no restart; five writes to `tasks.md` within seconds produced one comment edit 40 s later, and no second one.
  - Apply note: one OpenSpec CLI call takes about 1.5 s and the worktrees hold about 26 changes, so `openspec.ts` caches each change's tasks by the mtime of its `tasks.md`; a debounced pass reruns the CLI only for changes that moved.
- [x] 5.4 `launchd` template `scripts/issue-sync/rocks.grnyte.issue-sync.plist` (`KeepAlive`, `PATH` with the Volta and Homebrew bins, log to `~/Library/Logs/grnyte-issue-sync.log`) and `scripts/issue-sync/README.md` with the install, Keychain and denylist steps. Verify: `plutil -lint` passes; following the README installs it and the log shows a first pass.
  - Apply note: `origin` is an SSH remote, so under `launchd` the fetch needs an ssh-agent socket and a loaded key; the first-pass check confirms the fetch succeeded, and the README covers what to do if it does not.

## 6. Rules, skills and rollout

- [x] 6.1 `AGENTS.md`: four rules (capture in `tasks.md` or `issues:followup`, no personal or environment details in anything written, stay inside `x-paths`, start roadmap work with `/start-issue`), one or two lines each. Verify: prettier clean; no em-dashes.
- [x] 6.2 `.agents/skills/start-issue/SKILL.md` plus the symlink `.claude/skills/start-issue`: `EnterWorktree` named `<n>-<slug>`, reset to `origin/develop`, branch renamed to `feature/<n>-<slug>`, `npm ci`, `x-issue` and `x-paths: []` written, refusal only for a change name another worktree already uses; started inside a worktree session it stops with a message before doing anything. If the sandbox refuses the write, the developer or an unsandboxed session writes it. Verify: `/start-issue` on a test issue creates the worktree and link from the main checkout; the same change name again refuses; a second change for the same issue succeeds; run from inside a worktree it stops with its message.
  - Apply note: the main checkout gets the skill only after merge, so its check is deferred to the Discovered item for issue 1167.
  - Apply note: the sandbox refused the symlink; the developer runs `ln -s ../../.agents/skills/start-issue .claude/skills/start-issue`.
- [x] 6.3 `.agents/skills/review-loop/SKILL.md`: in implementation mode, when the work is an active OpenSpec change, run `npm run issues:gate -- <change>` before Setup and stop on failure; plan mode and change-less reviews skip it. Same sandbox fallback as 6.2. Verify: a review loop on a change with an open task stops at the gate; `plan <change>` does not run it.
  - Apply note: the gate is step 0 of Setup; `skill/review-loop-plan-convergence` changes only the Stop and Plan mode sections, so the two merge without conflict.
- [x] 6.4 Dry run against the live worktrees, then one live pass for a single issue: `npm run issues:sync -- --once --dry-run`, then `npm run issues:sync -- --once --issue <n>`. Verify: the developer reads every planned comment (no mention, no linked reference, no withheld text); on GitHub the issue shows the comment and the project shows its Phase, Worktree and Open tasks.
- [x] 6.5 Link the open changes whose owners agree: ask the session that owns `migrate-supabase-keys` to add `x-issue: 1143`, and to add `x-issue: 1144` to the change for native app sign-in once it exists. Verify: `issues:status` lists them under their issues.
  - Apply note: `migrate-supabase-keys` names 1143 (in `keys-b-app`); its first live pass wrote the comment and the three fields. `add-native-auth-handoff` names 1144; both comments came from the `launchd` agent.

## 7. Verification sweep

- [x] 7.1 Over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project server scripts/issue-sync`, `npm run issues:typecheck`, `npm run lint:unused`, `npm run lint:duplication`, `npm run lint:health`. No app screen changes, so there is nothing to drive at 375x667 or 1280x800. Verify: all green.
  - Apply note: after apply the folder splits D1's core and edges into `core/`, `edges/` and `cli/` (entry points; `gate-cli.ts` became `cli/gate.ts`).
  - Apply note: `.fallowrc.jsonc` lists the entry points by name and leaves the five edge files out of `lint:health`, as it does `src/lib/db/scripts/**`; `gate` was split into helpers to meet the cognitive limit.

## 8. Issue statuses in place of Phase

Supersedes the Phase parts of 2.2, 4.3, 4.4 and 6.4, and "as Todo" in 4.3 and 4.5. Paths are under `scripts/issue-sync/`.

- [x] 8.1 Rename `core/phase.ts` to `core/progress.ts` and `Phase` to `Status` (`Backlog | Todo | In progress | In review`), deriving and rolling up as D8 says (S3), test first. Verify: `core/progress.test.ts` green, each changed case seen red.
  - Apply note: 8.1 to 8.5 update their importers as they go (`edges/local.ts` holds `Judged.phase`); `npm run issues:typecheck` runs after 8.5.
- [x] 8.2 `core/render.ts`: the section heading shows the status, or "Archived" for an archived change (S1), test first. Verify: `core/render.test.ts` green, the changed literals seen red.
- [x] 8.3 `core/plan.ts`: `planStatus`, and `Fields` without Phase (S6), test first. Verify: `core/plan.test.ts` green, each skip case seen red by the one edit that drops it.
- [x] 8.4 `edges/github.ts`: read an issue's state and status with the repository's statuses, and set a status, both with the issues token; drop Phase from the project query and `FIELD_NAMES`. `cli/sync.ts`: write the status after the comment and fields, log a skip for a missing status, count a failed request as a failed run, and add follow-ups without a project Status. Verify: `npm run issues:sync -- --once --dry-run` prints the planned status of each open linked issue whose status differs, and writes nothing.
  - Apply note: the status step has its own catch that pushes to `errors`, so a failing status request skips neither the comment, the fields nor the follow-ups; checked once by breaking the status query and reading the dry run.
- [x] 8.5 `cli/setup-project.ts` creates only Worktree and Open tasks; `cli/status.ts` and `README.md` name the status instead of Phase. Verify: `npm run issues:setup-project` reports nothing to do and names exactly Worktree and Open tasks; no Phase is named under `scripts/issue-sync/`.
  - Apply note: the README's "three project fields" and its Remove section (statuses stay too) change with it.
- [x] 8.6 After the developer restarts the agent, which runs from this worktree until the merge: the linked open issues show their derived status, closed ones are unchanged, and a second pass writes nothing. Verify: read the issues back from GitHub.
- [x] 8.7 The 7.1 sweep over the touched paths. Verify: all green.

## Discovered

- [ ] [later] #1167 Try `/start-issue` from the main checkout once this change is merged: the main checkout gets the skill only then.
