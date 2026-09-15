import * as zod from 'zod/mini'

/**
 * zod, with a locale registered. Import `z` from here and never from `zod/mini` directly.
 *
 * `zod/mini` is the tree-shakeable half of zod (see the `perf(deps)` commit that introduced it: the
 * chainable API keeps every method on a prototype, so one `z.string()` pulls the whole library).
 * The half it drops is the one classic zod loads for you: `zod/v4/classic/external.js` runs
 * `config(en())` as an import side effect, and the mini entry point does not. Without this call
 * every message zod produces itself collapses to the bare string `Invalid input`: not only in
 * shape, but in the only part a reader sees:
 *
 *     z.string().safeParse(1)                  Invalid input: expected string, received number
 *     z.enum(['public', 'private'])            Invalid option: expected one of "public"|"private"
 *     z.string().check(z.minLength(3))         Too small: expected string to have >=3 characters
 *
 * That matters because `resolveIssueMessage` renders anything it cannot resolve to a paraglide key
 * verbatim, so an unlabelled schema's message goes straight in front of a user. A blank first
 * ascensionist name, an over-long comment and a bad video URL would all read `Invalid input`.
 *
 * The locale is `en` and does not follow the reader's, which is a real decision and not an
 * oversight, so it is worth saying why a German reader is not being short-changed.
 *
 * Nothing a user is meant to act on comes from here. Copy for them goes through `formError()`,
 * which emits a paraglide key that `resolveIssueMessage` resolves in their locale on the client:
 * every field a person can type into is labelled that way, and `zod.locale.test.ts` is not what
 * guards that, reading the schema is. What is left for this locale to speak for is the input a
 * correct client cannot produce: ids, discriminators and snapshot shapes reached only by a tampered
 * or broken caller, plus server-side validation nobody sees but us (Zero's `get-queries` argument
 * check among it). English is the right language for those, the same call the auth mail makes.
 *
 * Switching it per reader is not available even if we wanted it. `config()` writes one global in
 * `zod/v4/core`, and the server validates every form submission in a process serving all locales at
 * once, so a per-request locale would be a race between concurrent requests rather than a setting.
 * Localising only the client would leave the two disagreeing about the same field. A schema whose
 * message must be translated therefore has to say so itself, with `formError()`, which is the rule
 * anyway and costs nothing.
 *
 * Registering it here rather than in `schemas.ts` is what makes it hold: two thirds of the modules
 * that build schemas (every `entities/*[/]queries.ts`, `db/schema.ts`, `auth/session.remote.ts`)
 * never import that file, and a locale registered somewhere half the graph misses is worse than
 * none: it makes the copy a user sees depend on which modules a route happened to pull in. Going
 * through this module means there is no way to spell `z` that skips the call. `no-restricted-imports`
 * in `eslint.config.js` keeps it that way, and `zod.locale.test.ts` fails if the call is lost.
 */
zod.config(zod.locales.en())

export * from 'zod/mini'
