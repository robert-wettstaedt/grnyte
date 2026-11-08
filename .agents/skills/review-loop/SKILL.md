---
name: review-loop
description: Run the review loop on a finished implementation from the implementing session, or on an OpenSpec change before apply (`plan <change>`). Background reviewer subagents (code, app driving plus design, security on demand, thermo-nuclear on request; reader and grounding in plan mode) review a pinned snapshot; the implementer waits for all of them, rules on each finding, fixes, and re-requests until clean. Use when the user says "/review-loop", "start the review loop", "get this reviewed", "review the plan", or "review and fix until clean". Args: [base] [+security] [-drive] [-simplify] [+thermo] [+fresh] | plan <change> [+security].
---

# Review loop

You are the implementer. You orchestrate reviewers, rule on their findings and fix. You never review
your own change in their place. You wrote what is under review: a wish to reject a finding is not
evidence that it is wrong.

## Hard rule

**Touch no tracked file while any reviewer of the current round is still running.** One reviewer
reporting is not a go-ahead. Wait for every notification of the round, then act. The driving reviewer
drives the live dev server, which serves the working tree, so an early edit changes what it is testing.

## Arguments

- `base`: branch to diff round 1 against. Default `develop`.
- `+security`: force the security reviewer. It also runs automatically when the change touches
  `src/hooks*`, `src/lib/auth/`, `src/lib/hooks/`, `*.remote.ts`, `*.server.ts`, `+server.ts`,
  `src/lib/db/schema.ts` or `drizzle/` (in plan mode: when the plan names any of them).
- `-drive`: skip the driving reviewer (docs, tests or server-only change with no screen).
- `-simplify`: skip the `/ce-simplify-code` pre-pass in Setup (a tiny or prose-only change).
- `+thermo`: run round 0 (below). Off by default.
- `+fresh`: after the first clean round, one confirmation round by a fresh `code` reviewer (see Stop).
- `plan <change>`: review `openspec/changes/<change>/` before any code exists. See Plan mode.

## Setup

1. List the paths YOU changed for this task (never `git add -A` scope: other agents share the checkout).
   Unless `-simplify`, run `/ce-simplify-code mode:pipeline <your paths> proof-test:<each test proving
   the change>` once; it edits, so it never runs again in later rounds.
   Run the AGENTS.md hand-back checks over them first; reviewers should not find what prettier, eslint,
   vitest or svelte-check would.
2. Create the findings file `<scratchpad>/review-loop/findings.md`: one row per finding, numbered across
   all rounds and reviewers: `#n | raised by | file:line | severity | claim | status | reason/evidence`.
   Severity is the reviewer's (`blocker`, `major`, `nit`) and only a reviewer changes it. Status is
   `open`, `fixed`, `rejected`, `disputed`, `decision` (for the user) or `nit`.
   One row per issue: same scope and same failure case from a second reviewer adds its name to
   `raised by`; a re-raise of an existing row points to that row, never a new one.
3. Snapshot, so every reviewer reads the same bytes (includes untracked files, leaves the index alone):

   ```bash
   idx=$(mktemp); command cp -f "$(git rev-parse --git-path index)" "$idx"
   GIT_INDEX_FILE="$idx" git add -- <your paths>
   SHA=$(git commit-tree "$(GIT_INDEX_FILE="$idx" git write-tree)" -p HEAD -m "review-loop round N")
   command rm -f "$idx"
   ```

   Round 1 range: `$(git merge-base <base> HEAD)..$SHA`. Later rounds: `<previous SHA>..$SHA`.

## Round 0 (`+thermo` only)

One background `general-purpose` subagent with the reviewer preamble below, plus: "Read
`~/.agents/skills/thermo-nuclear-code-quality-review/SKILL.md` with the Read tool and follow it." (That
skill has `disable-model-invocation`, so it cannot be loaded through Skill. Never paste its text here.)
Apply the structural findings that hold, re-snapshot, then start round 1. Thermo does not run again.

## Rounds 1..N

Spawn in ONE message, each `subagent_type: general-purpose`, `run_in_background: true`, no model override:

| Reviewer | Brief |
|---|---|
| code | Load `/code-review` at `high` on the range. Then a sibling-consistency pass: functions or types the change adds side by side must share shape, parameter types, naming and error behaviour, not just match their own call site. |
| drive | Load `/grnyte-verify`. Drive every affected screen at 375x667 and 1280x800, both themes, en and de. Judge the design on its own terms: hierarchy, spacing and alignment consistent with neighbouring screens, the AGENTS.md rules on transitions, layout shift and page chrome. Sole browser user; close your pages and say "browser is free". |
| security | Load `/security-review` on the range. Only when triggered (see Arguments). |

Round 2 onward: do NOT spawn new reviewers. `SendMessage` each round-1 reviewer by its agentId so it
keeps its context. Re-request from every reviewer of the loop, not only those with open findings.

**Not run is not clean.** A reviewer that fails, times out, returns no report, or could not use its
instrument (drive never got the browser, the dev server was down) did not review. Retry it once; if it
fails again, record it `not run` in the round line. A round with a `not run` reviewer is not clean.

### Reviewer preamble (send verbatim, then the brief)

> You are one of several independent reviewers of a change in grnyte. Review snapshot `<SHA>`: read
> files with `git show <SHA>:<path>`, never the working tree, which other agents edit. Range: `<range>`.
> The implementer's paths: `<paths>`. Task and plan: `<one line + openspec path if any>`. If the change
> has `openspec/changes/<change>/review.md`, plan decisions settled there are out of scope: report only
> where the code departs from the plan.
> Findings so far, with rulings: `<findings file path>`. Read it first. You may dispute a rejection
> once, with new evidence; after that it goes to the user. Confirm or reopen every finding marked
> `fixed`.
> Before looking, write down what you are trying to falsify. Report only concrete findings: `file:line`,
> the failure case (inputs or state, then the wrong outcome), and severity (`blocker`, `major`, `nit`).
> Do not pad. If clean, say so in one line. Do not edit any file.

## Ruling (after every reviewer of the round has reported)

First decide whether the round was clean (see Stop), from the reports as they stand, before fixing.
Then, for each new finding, read the cited code at the snapshot before deciding:

- **holds**: fix it.
- **does not hold**: cite what the reviewer can read at the snapshot: the `file:line` of the guard, the
  test, the caller. "Intended", "fine" or "misread" alone is not a reason. Default here when the code
  does not confirm the claim; a plausible wrong fix costs more than a skipped one.
- **holds partly**: the bug is real, the proposed fix is not; say what you do instead.
- **decision**: a product, copy or scope question, or a finding whose only refutation lives outside the
  snapshot (a verbal decision, prod state, the user's intent; name it). Set aside for the user; keep
  fixing the rest.
- Never lower a severity on your own. To dispute one, rule `does not hold` with a cited reason.
- Do not add a comment, guard or test only to stop a reviewer flagging something. If no reader, caller
  or runtime needs it, rule `does not hold` and say so.
- A finding disputed a second time becomes `decision`. No third exchange.

Update the findings file, then tell the user ONE line, decisions first: `Round N: c decisions, x
findings, a fixed, b rejected, [not run: <reviewer>], re-review sent.` Fix, rerun the hand-back checks on
what you touched, snapshot, next round.

**Churn.** If a new finding sits at the lines of an earlier round's fix and reverting that fix would
resolve it, do not fix again: stop and ask (see Stop).

## Stop

A round is **clean** when no reviewer reports an open finding above `nit` and none is `not run`.

Stop when any of these holds:

- a round is clean (nits get fixed or listed, they never trigger a round). With `+fresh`, and only if
  the clean round's snapshot includes fixes, first send one NEW `code` reviewer (preamble, findings
  file, full round-1 range) and stop only if it is clean too;
- the remaining findings are only in prose (comments, docs, i18n copy): the code has settled;
- round 4 is done, or churn: list the open findings by severity and ask the user one question: accept
  them, continue, or go back to the plan.

Do not commit. Hand back: rounds run, final SHA, any `not run` reviewer, what was fixed (one line each),
what was rejected and the cited reason, and a numbered list of `decision` items for the user to answer
per number.

## Plan mode (`plan <change>`)

Reviews an OpenSpec change after `/opsx:propose` and before `/opsx:apply`, from the proposing session.
Run it when the change has a `design.md`; skip a change without one, or on the user's `-plan`. Rerun
when its `review.md` says `stale`. Everything above applies, with these differences.

**Setup.** No simplify pass, no hand-back checks. Snapshot the change folder with the recipe above
(paths: `openspec/changes/<change>/`). The findings file is `openspec/changes/<change>/review.md`, so it
is archived with the change: a `Status: open | clean | stale` line, the snapshot SHA of each round,
each round's paraphrases verbatim, the claim table, then the findings table above with ids `#P1..`.
Any edit to the change after a clean review sets `Status: stale`.

**Reviewers.** Two, plus security when triggered. They get the change folder at the snapshot,
AGENTS.md (loaded with the project CLAUDE.md), CONTEXT.md, `openspec/config.yaml`, the main specs under
`openspec/specs/` the change modifies, archived changes, and the code at `<SHA>`. They do NOT get the
conversation, research or decisions files under `docs/`, or `*-PLAN.md` scratch: a decision that lives
only there and not in the change is exactly the gap to find. Never paste deliberation into a brief.

| Reviewer | Brief |
|---|---|
| reader | Before anything else, write **What this proposes** and **How the existing system works, per this plan**, 2 to 5 sentences each, from the artifacts alone. A section you cannot paraphrase is a `blocker`. Flag a project-specific term defined neither in the plan nor in CONTEXT.md. For every new module, helper or component the design proposes, search the code at `<SHA>` for an existing one. Then YAGNI, failure modes, and every AGENTS.md rule the plan breaks or forgets (i18n, `known` fingerprints, deploy skew, `entityHref`, transitions, layout shift), citing the AGENTS.md line. |
| grounding | List every claim the plan makes about code that exists now (a file, symbol, column, behaviour, "X already does Y") and check each at `<SHA>`: `holds`, `contradicted` (a `blocker`: every reader inherits it) or `missing`. A proposed new file is not a finding unless the tasks fail to mark it create or modify (`major`, once). Check each task is one reviewable edit with a concrete verification step, and the `rules` in `openspec/config.yaml`. Return the claim table as well as the findings. |

Preamble changes: "The plan is `openspec/changes/<change>/` (proposal, design, specs, tasks). No code
is written yet. Findings so far: `openspec/changes/<change>/review.md`. You have not seen the
conversation that produced this plan; if you need it to understand something, that is a finding.
Memory is not evidence of what the plan says." Findings cite the artifact's `file:line`, and the failure
case is what goes wrong during apply.

**Ruling.** As above, plus:

- Check each paraphrase against the user's intent and the decisions file, if any. A wrong paraphrase is
  a finding against the plan, never against the reviewer.
- A comprehension gap cannot be ruled `does not hold`: if a fresh reader could not follow the plan, the
  plan is missing context.
- Add context only where a human implementer needs it. If only a zero-context reviewer would, make it a
  `decision`.
- Fix by editing the artifacts, then run the coherence pass of `/opsx:update` (check every other
  artifact against the edit) without its per-edit confirmation.

**Rounds.** The reader is spawned fresh every round (a resumed reader has read the old text, which
defeats the paraphrase). The grounding reviewer is resumed by `SendMessage`. Stop after one clean round;
cap 3 rounds, then the cap question above. Hand back: set the status, list rounds and SHAs, what was
fixed and rejected, the numbered `decision` items, then "run `/opsx:apply` when ready". Do not commit.
