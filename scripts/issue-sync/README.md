# Issue sync

The issue sync shows each OpenSpec change's open tasks on the roadmap issue that the change names as `x-issue` in its `.openspec.yaml`. It keeps one comment on the issue, sets the issue's status, and sets Worktree and Open tasks on the private roadmap project. A `launchd` agent runs it on the developer's Mac and watches `openspec/changes/` in every worktree. The design is in `openspec/changes/archive/*-add-issue-sync/design.md`.

## Layout

- `cli/`: the entry points that the npm scripts and the `launchd` agent run.
- `core/`: the pure modules with their tests and the recorded OpenSpec fixtures.
- `edges/`: the modules that call git, the OpenSpec CLI, GitHub and the Keychain, and that keep state and watch files. They have no unit tests; the dry run checks them.

## Commands

- `npm run issues:sync -- --once --dry-run`: print the comments, statuses and field writes of one pass, and write nothing.
- `npm run issues:sync -- --once [--issue <n>]`: run one pass, for one issue only with `--issue`.
- `npm run issues:status`: show each issue's changes, the unlinked changes, the withheld items and the last error.
- `npm run issues:gate -- <change>`: tell whether a change is ready for a pull request.
- `npm run issues:followup -- <parent> "<title>"`: create a follow-up issue for a `[later]` item.
- `npm run issues:setup-project`: create the Worktree and Open tasks project fields. Run it once.

## Issue statuses

| Change                                     | Issue status |
| ------------------------------------------ | ------------ |
| No tasks yet                               | Backlog      |
| Tasks written, none done                   | Todo         |
| Work started                               | In progress  |
| The gate passes, or the change is archived | In review    |

The least advanced change decides when several changes name one issue. The sync never opens or closes an issue. An issue stays In review until a release into `main` or the developer closes it, and GitHub then shows Done. Do not set the status of an open linked issue by hand, because the next pass replaces it.

## Install

Run these steps in your own terminal, in the main checkout, outside the agent sandbox.

1. Store the two tokens in the Keychain. Each command asks for the token.

   ```bash
   security add-generic-password -s grnyte-issue-sync-issues -a "$USER" -w
   security add-generic-password -s grnyte-issue-sync-project -a "$USER" -w
   ```

   The issues token is a fine-grained token with Issues read and write on this repository. The project token is a classic token with the `project` scope, because fine-grained tokens cannot reach a user's project.

2. Write the denylist to `~/.config/grnyte/issue-sync.json`. Put in it every term that must never be published: your hostname, your name, the names of your machines and networks. The sync refuses to run without this file.

   ```json
   { "denylist": ["my-hostname", "my-name"] }
   ```

3. Run a dry run and read every planned comment. Make sure that it holds no mention, no linked issue reference and no personal or local detail.

   ```bash
   npm run issues:sync -- --once --dry-run
   ```

4. Make sure that `git fetch` works without a prompt. `origin` is an SSH remote, and the agent has no terminal to ask for a passphrase. Load the key into the agent with `ssh-add --apple-use-keychain ~/.ssh/<key>`.

5. Install the agent from the template and start it.

   ```bash
   sed -e "s|__HOME__|$HOME|g" -e "s|__REPO__|$PWD|g" scripts/issue-sync/rocks.grnyte.issue-sync.plist > ~/Library/LaunchAgents/rocks.grnyte.issue-sync.plist
   ```

   ```bash
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/rocks.grnyte.issue-sync.plist
   ```

6. Read the log. The first pass prints a line per linked issue.

   ```bash
   tail -f ~/Library/Logs/grnyte-issue-sync.log
   ```

   If the log says `could not fetch develop`, the agent cannot reach the SSH key. Repeat step 4, then restart the agent with `launchctl kickstart -k gui/$(id -u)/rocks.grnyte.issue-sync`. Until the fetch works, the gate compares against the last fetched `develop`.

## Failures

After three failed runs in a row the agent shows one macOS notification. `npm run issues:status` shows the last error. The state lives in `~/Library/Application Support/grnyte-issue-sync/`.

## Remove

```bash
launchctl bootout gui/$(id -u)/rocks.grnyte.issue-sync
```

The comments and statuses stay as the sync last wrote them. Change them by hand if you do not want them.
