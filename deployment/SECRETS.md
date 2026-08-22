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

- `ZERO_*` (`ZERO_UPSTREAM_DB`, `ZERO_AUTH_SECRET`, `ZERO_ADMIN_PASSWORD`, `ZERO_GET_QUERIES_URL`)
  is the Zero server's. It goes to the VPS and is kept off Vercel.
- Everything else is the app's. It goes to Vercel. `PUBLIC_ZERO_URL` is the app's, not the server's.
- Local development gets both halves, because it runs both.

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
- Repository secret `BWS_ACCESS_TOKEN_PROD` (the prod token again), for the scheduled post-deploy
  canary. It is repository level rather than environment level so a required-reviewer rule can never
  park a scheduled run.
- Delete, now unused: environment secrets `ZERO_UPSTREAM_DB`, `ZERO_AUTH_SECRET`,
  `ZERO_ADMIN_PASSWORD`; environment variables `ZERO_DOMAIN` and `ZERO_GET_QUERIES_URL`; repository
  secrets `E2E_PASSWORD`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_SENDER_EMAIL`.
  `ZERO_GET_QUERIES_URL` moves into the two projects as an ordinary secret. `ZERO_DOMAIN` simply
  goes: nothing reads it, because `nginx.zero.conf` names both domains itself.
- Keep: `VPS_SSH_KEY`, the `VPS_HOST` / `VPS_USER` / `E2E_BASE_URL` variables, and the two VAPID
  secrets (see below).

Finally downgrade the three machine accounts to **Can read**.

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
`post-deploy.yml` runs its two checks under `bws run`, so no value is ever written to a file or to
`$GITHUB_ENV`.

**Vercel holds a copy, not a live read.** `$env/static/private` is inlined at build time, so a
changed secret needs the push above _and_ a redeploy before it takes effect.

## What stays out

`ci.yml` keeps its dummy `foobar` values and the two real GitHub secrets `PRIVATE_VAPID_KEY` and
`PUBLIC_VAPID_KEY`. It runs on every branch, including forks, and giving that a Bitwarden token would
widen the blast radius to buy nothing: the job builds its database from scratch and talks to no
service.

## Rotating

A secret: change it in the web vault or with `bws secret edit <id> --value '<new>'`, then
`node deployment/secrets.mjs vercel <project>` and redeploy. For a `ZERO_*` value, re-run
`deploy-zero.yml` instead. Locally, `npm run secrets:pull`.

An access token: create the new one first, update the GitHub secret, then revoke the old one in the
machine account's **Access tokens** tab.

## Known edges

- A value containing `"`, `\`, `$` or a newline cannot be represented in a `.env` that both
  `dotenv` (drizzle) and Vite read back identically, so `pull` refuses and names the key. Change the
  value, or run that command under `bws run --`, which has no such limit.
- `bws secret create` and `bws secret edit` take the value as a command line argument, so it is
  visible in `ps` while the command runs. Fine on your laptop, not on a shared host.
- `bws` is pinned to 2.1.0 in the workflows. A deploy is a bad place to meet a new CLI.
