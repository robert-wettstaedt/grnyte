---
name: start-issue
description: Start work on a roadmap issue in its own worktree, with an OpenSpec change linked to the issue so its open tasks show on GitHub. Use when the user says "/start-issue <n>", "start issue <n>", "pick up #<n>" or "start the next roadmap item". Run from a session in the main checkout. Args: <issue number> [change-name].
---

# Start issue

Creates a worktree and branch for one roadmap issue and an OpenSpec change that names the issue as
`x-issue`. The issue sync then keeps the change's open tasks on the issue (`scripts/issue-sync/README.md`).

## 1. Check where you are

Run `git rev-parse --git-dir --git-common-dir`. If the two paths differ, this session is in a worktree:
stop and say "Run /start-issue from a session in the main checkout. EnterWorktree cannot create a
worktree from inside one." Do nothing else.

## 2. Name it

1. Read the issue: `gh issue view <n> --json title,state`. If it is closed, ask before you continue.
2. The change name is the second argument, or a kebab-case name of two to four words from the title.
   Call it `<change>`; the worktree and slug are `<n>-<change>`.
3. List the worktrees with `git worktree list --porcelain`. If any of them holds
   `openspec/changes/<change>/`, stop and say which worktree uses that change name. Another change for
   the same issue under a different name is fine: several changes may serve one issue.

## 3. Create the worktree

1. `git fetch origin develop`.
2. Call `EnterWorktree` with the name `<n>-<change>`. It branches from `main`.
3. In the new worktree, as separate commands:
   - `git reset --hard origin/develop` (the new branch has no commits of its own yet).
   - `git branch feature/<n>-<change>`, then `git switch feature/<n>-<change>`. The sandbox cannot write
     `.git/config`, so `git switch -c` with an upstream fails.
   - `git branch -D worktree-<n>-<change>`, the branch `EnterWorktree` made.
4. `npm ci`.

## 4. Create and link the change

1. `npx -y @fission-ai/openspec@<version> new change <change>`, with `<version>` the `OPENSPEC_VERSION` in `scripts/issue-sync/core/version.ts`.
2. Append to `openspec/changes/<change>/.openspec.yaml`:

   ```yaml
   x-issue: <n>
   x-paths: []
   ```

   The change's own folder is always in scope. Add the code globs when you write the proposal.

## 5. Hand back

Report the worktree, the branch and the change, and that the issue comment appears on the sync's next
pass once `tasks.md` exists. Then offer the next step: `/grilling` for an open design, else `/opsx:propose <change>`.
