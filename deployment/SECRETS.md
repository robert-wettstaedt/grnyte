# Secrets

Every environment variable for the three environments lives in Bitwarden Secrets Manager. Nothing is
typed into the Vercel dashboard, the VPS or GitHub by hand any more, with the two exceptions listed
under [What stays out](#what-stays-out).

## The model

Three projects, three machine accounts, one account per project, `Can read`:

| Project       | Machine account | Reads                                                           |
| ------------- | --------------- | --------------------------------------------------------------- |
| `grnyte-dev`  | `grnyte-dev`    | your laptop                                                     |
| `grnyte-demo` | `grnyte-demo`   | Vercel demo project, `zero-server-demo`                         |
| `grnyte-prod` | `grnyte-prod`   | Vercel prod project, `zero-server-prod`, the post-deploy canary |

The access token **is** the environment selector. Because a machine account can see exactly one
project, no project id, no environment name and no per-environment branch appears in
`deployment/secrets.mjs` or in the workflows: point `BWS_ACCESS_TOKEN` at demo and every command
below talks to demo.

Secret keys are the environment variable names, verbatim, so the same key exists in all three
projects with different values.

Which half of a project goes where:

- `ZERO_*` is the Zero server's. It goes to the VPS and is kept off Vercel. Five of them actually
  reach it, and `deploy-zero.yml` names those five: `ZERO_UPSTREAM_DB`, `ZERO_AUTH_SECRET`,
  `ZERO_ADMIN_PASSWORD`, `ZERO_GET_QUERIES_URL`, `ZERO_NUM_SYNC_WORKERS`. The projects also hold
  `ZERO_REPLICA_FILE`, `ZERO_SCHEMA_PATH`, `ZERO_CVR_MAX_CONNS` and `ZERO_UPSTREAM_MAX_CONNS`, which
  `docker-compose.zero.yml` sets in its own `environment:` block. That overrides `env_file:`, so
  editing those four in the vault changes nothing. Change the compose file instead, or delete them.
- `VPS_SSH_KEY`, `VPS_HOST` and `VPS_USER` are the deploy's, and live in **grnyte-prod and
  grnyte-demo both**, with the same value in each: one VPS carries both Zero servers, and the free
  plan has no room for a shared infrastructure project. Rotating the key means editing two secrets,
  and forgetting the second one fails the demo leg at `ssh-keyscan`.
- Everything else is the app's. It goes to Vercel. `PUBLIC_ZERO_URL` is the app's, not the server's.
- Local development gets both halves, because it runs both. `VPS_*` is not in grnyte-dev: nothing
  local talks to the VPS.

This fits the Bitwarden **Free** plan exactly: 2 users, 3 projects, 3 machine accounts. A fourth
environment means Teams.

## One-time setup

1. Admin Console > Billing > Subscription > check **Subscribe to Secrets Manager**.
2. Secrets Manager > **New > Project**, three times: `grnyte-dev`, `grnyte-demo`, `grnyte-prod`.
3. **New > Machine account**, three times, same names. In each account's **Projects** tab assign its
   one project as **Can read, write** for now; downgrade to **Can read** once the bootstrap below is
   done.
4. In each account's **Access tokens** tab, **Create access token**, expiration **Never**. The token
   is shown once and cannot be retrieved later, so put it in your Password Manager vault as you go.
5. Install the CLI: `curl https://bws.bitwarden.com/install | sh`. With sudo it lands in
   `/usr/local/bin`; if you decline the sudo prompt it falls back to `~/.local/bin`, which you then
   have to put on `PATH` yourself.

## Bootstrap

Fill each project from whatever holds the values today. `seed` creates keys that are missing and
updates the ones that already exist, so it is safe to re-run.

```bash
# dev, from the .env you already have
BWS_ACCESS_TOKEN=<dev token> node deployment/secrets.mjs seed .env

# prod and demo, from Vercel
vercel env pull .env.tmp --environment=production --project grnyte
BWS_ACCESS_TOKEN=<prod token> node deployment/secrets.mjs seed .env.tmp
rm .env.tmp
```

Two things `vercel env pull` will not give you:

- **Sensitive** variables come back empty. Vercel cannot read those back to anyone, including you,
  so take those values from their own source (Supabase, Resend, Bunny) or from your vault.
- The four `ZERO_*` server variables were never in Vercel. Add them with
  `bws secret create ZERO_UPSTREAM_DB '<value>' <project id>` (`bws project list` prints the id), or
  in the web vault.

Then, in GitHub:

- Environment `Production – grnyte.rocks`: add secret `BWS_ACCESS_TOKEN` (the prod token).
- Environment `Production – demo.grnyte.rocks`: add secret `BWS_ACCESS_TOKEN` (the demo token).
  The scheduled post-deploy canary reads the first of these through an `environment:` on its job.
  An earlier version of this file asked for a repository-level `BWS_ACCESS_TOKEN_PROD` as well, so
  that a required-reviewer rule could never park a scheduled run. The trade went the other way: a
  repository secret is readable by a job on **any branch**, which is a wider standing exposure for
  production's whole secret set than a protection rule nobody has added. The risk moved rather than
  vanished, so it is written down where it bites: adding required reviewers to
  `Production – grnyte.rocks` stops the canary running at all, and a canary that does not run looks
  exactly like one that passes.

**These two are the only secrets GitHub stores.** There are no repository secrets and no Actions
variables; every other value is read from Bitwarden at run time by `bitwarden/sm-action`, pinned by
commit in each workflow. Delete the rest **after the v2 cutover, not before** — `main` still reads
`ZERO_UPSTREAM_DB`, `ZERO_AUTH_SECRET`, `ZERO_ADMIN_PASSWORD` and `VPS_SSH_KEY` as `secrets.*`, and
Zero deploys from `main`:

- Repository secrets `E2E_PASSWORD`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_SENDER_EMAIL`, `VPS_SSH_KEY`,
  `ZERO_ADMIN_PASSWORD`; environment secrets `ZERO_UPSTREAM_DB`, `ZERO_AUTH_SECRET`.
- Variables `VPS_HOST`, `VPS_USER`, `E2E_BASE_URL`, `ZERO_DOMAIN`, `ZERO_GET_QUERIES_URL`,
  `CERTBOT_EMAIL`. `ZERO_DOMAIN` and `CERTBOT_EMAIL` are read by nothing in the repository at all;
  the rest moved into the projects.
- `PRIVATE_VAPID_KEY` and `PUBLIC_VAPID_KEY` can go **immediately** rather than at the cutover:
  `main`'s `ci.yml` sets both to `foobar`, so nothing on any branch reads them once `ci.yml`
  generates its own pair.

Finally downgrade the three machine accounts to **Can read**. The workflows only read; a token that
can write is one log leak away from rewriting production's configuration.

## How a workflow reads a secret

`bitwarden/sm-action`, pinned by commit SHA, with an explicit list of `<uuid> > NAME` mappings. Two
properties earn it over the bare CLI, and both matter because this repository is public and its
Actions logs are readable by anyone:

- It registers every value it retrieves with `::add-mask::`. `bws run` injects them unmasked.
- The list is an allowlist. `bws run` hands the job everything the project holds; the canary receives
  its nine values and nothing else.

The mappings live next to the jobs rather than in a GitHub variable, because `deploy-zero` and
`post-deploy` run under the same environment and need different sets, and an allowlist nobody can
review in a diff is not one. `node deployment/secrets.mjs ids` prints them in the exact input format;
uuids are identifiers rather than credentials, so they belong in a public workflow file.

Uuids are per project, so the same key has a different one in prod and demo. `deploy-zero.yml` keeps
each environment's mapping in its matrix entry beside the environment name.

## Daily use

```bash
# Local: rewrite .env from the dev project
npm run secrets:pull

# Local, without a .env at all: real environment variables, no file, no quoting rules
bws run -- npm run dev

# Push an environment to its Vercel project (ZERO_* are skipped)
BWS_ACCESS_TOKEN=<prod token> node deployment/secrets.mjs vercel grnyte
BWS_ACCESS_TOKEN=<demo token> node deployment/secrets.mjs vercel <demo project>
```

The VPS half is automatic: `deploy-zero.yml` pulls the project on the runner, keeps the `ZERO_*`
lines and writes them to `deployment/.env.<environment>` over SSH. The token never reaches the VPS.
`post-deploy.yml` reads its nine values through `sm-action`, which writes them to `$GITHUB_ENV` for
the steps that follow. That is broader than `bws run`'s single child process, and the trade is
deliberate: the allowlist means the job never holds anything but those nine, and every one of them is
masked, which `bws run` could not offer.

**Vercel holds a copy, not a live read.** `$env/static/private` is inlined at build time, so a
changed secret needs the push above _and_ a redeploy before it takes effect.

## What stays out

`ci.yml` keeps its dummy `foobar` values and holds **no secrets at all**. It runs on every push to
every branch and on every pull request, which is the largest log surface in the repository and the
worst place to put a token that reaches a whole project.

Its only real ones were the VAPID pair, and it does not need them: `push.server.test.ts` gates on
both variables being non-empty and hands them to `web-push`, which signs against a local HTTPS server
the test stands up itself. Nothing at the other end checks the key against a subscription, so
validity is asserted and identity never is. The workflow generates a throwaway P-256 pair per run.
The deployed pair stays in the projects, where identity does matter, because rotating it invalidates
every existing push subscription.

## Rotating

A secret: change it in the web vault or with `bws secret edit <id> --value='<new>'`, then
`node deployment/secrets.mjs vercel <project>` and redeploy. For a `ZERO_*` value, re-run
`deploy-zero.yml` instead. Locally, `npm run secrets:pull`.

Note the `=`. `bws` parses its arguments with clap, which reads a value beginning with `-` as another
flag and fails with `unexpected argument`. Any PEM block hits this, so an SSH key cannot be passed
with the spaced form at all.

`VPS_SSH_KEY`, `VPS_HOST` and `VPS_USER` exist in two projects. Rotate both, and verify the demo leg
of `deploy-zero.yml` rather than assuming it followed prod.

An access token: create the new one first, update the GitHub secret, then revoke the old one in the
machine account's **Access tokens** tab.

## Known edges

- A value containing `"`, `\`, `$` or a newline cannot be represented in a `.env` that both
  `dotenv` (drizzle) and Vite read back identically, so `pull` refuses and names the key. Change the
  value, or run that command under `bws run --`, which has no such limit.

  `VPS_SSH_KEY` is exactly this: a PEM block is multiline, so `secrets:pull:prod` and
  `secrets:pull:demo` now refuse and name it. That is correct rather than broken - a private key has
  no business in a `.env` - but it means those two commands are gone as a way to inspect prod and
  demo. `bws run -- <command>` and `bws secret get <id>` still work, and grnyte-dev is unaffected
  because nothing local talks to the VPS.

- `bws secret create` and `bws secret edit` take the value as a command line argument, so it is
  visible in `ps` while the command runs. Fine on your laptop, not on a shared host.
- `bws` is pinned to 2.1.0 in the workflows. A deploy is a bad place to meet a new CLI.
