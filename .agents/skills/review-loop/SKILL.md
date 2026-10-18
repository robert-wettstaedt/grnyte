---
name: review-loop
description: Run the review loop on a finished implementation from the implementing session. Background reviewer subagents (code, app driving plus design, security on demand, thermo-nuclear on request) review a pinned snapshot; the implementer waits for all of them, rules on each finding, fixes, and re-requests until clean. Use when the user says "/review-loop", "start the review loop", "get this reviewed", or "review and fix until clean". Args: [base] [+security] [-drive] [-simplify] [+thermo].
---

# Review loop

You are the implementer. You orchestrate reviewers, rule on their findings and fix. You never review
your own change in their place.

## Hard rule

**Touch no tracked file while any reviewer of the current round is still running.** One reviewer
reporting is not a go-ahead. Wait for every notification of the round, then act. The driving reviewer
drives the live dev server, which serves the working tree, so an early edit changes what it is testing.

## Arguments

- `base`: branch to diff round 1 against. Default `develop`.
- `+security`: force the security reviewer. It also runs automatically when the change touches
  `src/hooks*`, `src/lib/auth/`, `src/lib/hooks/`, `*.remote.ts`, `*.server.ts`, `+server.ts`,
  `src/lib/db/schema.ts` or `drizzle/`.
- `-drive`: skip the driving reviewer (docs, tests or server-only change with no screen).
- `-simplify`: skip the `/ce-simplify-code` pre-pass in Setup (a tiny or prose-only change).
- `+thermo`: run round 0 (below). Off by default.

## Setup

1. List the paths YOU changed for this task (never `git add -A` scope: other agents share the checkout).
   Unless `-simplify`, run `/ce-simplify-code mode:pipeline <your paths> proof-test:<each test proving
   the change>` once; it edits, so it never runs again in later rounds.
   Run the AGENTS.md hand-back checks over them first; reviewers should not find what prettier, eslint,
   vitest or svelte-check would.
2. Create the findings file `<scratchpad>/review-loop/findings.md`: one row per finding, numbered across
   all rounds and reviewers: `#n | raised by | file:line | claim | status | reason/evidence`. Status is
   `open`, `fixed`, `rejected`, `disputed`, `decision` (for the user) or `nit`.
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

### Reviewer preamble (send verbatim, then the brief)

> You are one of several independent reviewers of a change in grnyte. Review snapshot `<SHA>`: read
> files with `git show <SHA>:<path>`, never the working tree, which other agents edit. Range: `<range>`.
> The implementer's paths: `<paths>`. Task and plan: `<one line + openspec path if any>`.
> Findings so far, with rulings: `<findings file path>`. Read it first. You may dispute a rejection
> once, with new evidence; after that it goes to the user. Confirm or reopen every finding marked
> `fixed`.
> Before looking, write down what you are trying to falsify. Report only concrete findings: `file:line`,
> the failure case (inputs or state, then the wrong outcome), severity, and whether it is a nit. Do not
> pad. If clean, say so in one line. Do not edit any file.

## Ruling (after every reviewer of the round has reported)

For each new finding, read the cited code at the snapshot before deciding:

- **holds**: fix it.
- **does not hold**: one line why (guarded at X, unreachable, misread). Default here when the code does not
  confirm the claim; a plausible wrong fix costs more than a skipped one.
- **holds partly**: the bug is real, the proposed fix is not; say what you do instead.
- **decision**: product, copy or scope question. Set aside for the user; keep fixing the rest.
- A finding disputed a second time becomes `decision`. No third exchange.

Update the findings file, then tell the user ONE line: `Round N: x findings, a fixed, b rejected,
c decisions, re-review sent.` Fix, rerun the hand-back checks on what you touched, snapshot, next round.

## Stop

Stop when any of these holds:

- every reviewer reports no non-nit finding (nits get fixed or listed, they never trigger a round);
- the remaining findings are only in prose (comments, docs, i18n copy): the code has settled;
- round 4 is done: stop and ask the user whether to continue.

Do not commit. Hand back: rounds run, final SHA, what was fixed (one line each), what was rejected and why,
and a numbered list of `decision` items for the user to answer per number.
