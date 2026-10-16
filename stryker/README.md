# Mutation testing

`npm run test:mutation -- --mutate <file>` mutates one module; without arguments it runs the configured
scope. `npm run test:mutation:server -- <file>` is the DB-backed half: it takes a target rather than
defaulting to one, and needs docker (one throwaway Postgres per worker). Both configs and the runner live
here, so a bare `npx stryker run` finds nothing.

Aim it at a module whose contract is written down, read every survivor, and expect a third of them to be
equivalent mutants. The score is not the output, the survivor list is; never track it.

Three things decide whether a target runs at all:

- A test has to import it DIRECTLY. The runner drives `vitest related`, so a module reached only
  transitively instruments its mutants and then hard-errors with `No tests were found`, executing none.
  The same rule makes `NoCoverage` a claim about the related set, not the suite: a function whose only
  caller is tested elsewhere reports as uncovered here while `vitest run --coverage` shows it covered.
  Check one against the other before writing tests to close it.
- `--mutate` REPLACES the config array, negations included, so a directory glob must re-pass them
  (`--mutate 'src/lib/foo/**/*.ts,!src/**/*.test.ts'`).
- `*.svelte` is never matched, so logic in a `<script module>` block is unreachable until it moves to a `.ts`.

Re-running an unchanged file replays stored results without executing anything, which reads as "my new
test didn't help": pass `--force`, not `--incremental false`, which commander parses as a positional and
rejects. Mutators are a fixed set, so a rationale resting on an edit Stryker cannot make (reordering
statements, swapping two arguments, widening a `toFixed`) describes a mutant that will never appear. A
pure relabeling is equivalent by construction: if a function's result is only ever compared against
another result of the same function, every mutant that permutes its labels survives and none is a gap.
