---
name: review-triage
description: Review the current change for correctness, consistency and code smell, verify it in the real app, then present findings as a numbered action list to cherry-pick from (nothing auto-applied). Use when the user says "check correctness/consistency/code smell", "review and verify", "create an action list", or pairs /code-review with /grnyte-verify. The user then replies "fix #1-#3" or "fix all but #7".
---

# Review triage

The recurring loop: review the diff, verify it runs, hand back a numbered list the user picks from.
Do NOT fix anything in this skill. Wait for the user to say which numbers.

## Steps

1. **Review**: run `/code-review` on the working-tree diff (default effort). Focus on correctness,
   consistency with nearby code, and code smell. This is the bug/quality pass.
   - The `/code-review` finders skew toward higher-severity correctness bugs, so low-severity
     consistency nits get crowded out. After it returns, do your own **sibling-consistency pass**:
     for functions/types the diff adds or touches side by side, check they share shape, parameter
     types, naming, and return conventions. A param that is a `number` in one and a `Date` in its
     sibling, or one helper that logs-and-continues while its twin throws, is a finding even when
     each is locally defensible. Local consistency (matches its own call site) is not the same as
     sibling consistency (matches its peer); this step checks the latter.
2. **Verify**: run `/grnyte-verify` to drive the actual change in the running app. A finding that only
   shows up when driven (broken flow, wrong permission gate, layout break) is worth more than a typecheck.
   Skip only if the diff has no runtime surface (docs/comments/test-only).
3. **Merge into one list**: dedupe overlapping findings from the two passes. One numbered item each,
   most-severe first. Per item give a one-line description, the `file:line`, and the fix as a phrase (not
   applied). Separate confirmed bugs from style/opinion so the user can triage fast.

## Output shape

```
#1  <one line>  (src/lib/foo.ts:42)  fix: <phrase>
#2  ...
```

Then stop and ask which to fix. The user replies e.g. "fix #1-#3", "fix all but #7", "fix all".
On that reply, apply exactly those and nothing else.

## Notes

- Don't pad the list. A short list of real findings beats a long one with filler, since filler just gets "ignore #4-#8".
- If review and verify both come back clean, say so in one line instead of inventing items.
