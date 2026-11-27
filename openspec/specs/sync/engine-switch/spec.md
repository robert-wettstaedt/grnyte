# sync/engine-switch Specification

## Purpose

Decides which sync engine a build of the app runs, how a deployment chooses it, and what a build of one engine must not contain, while production moves from Zero to PowerSync.

## Requirements

### Requirement: A build runs the sync engine its deployment names

Every build SHALL choose its sync engine when it is built, from `PUBLIC_SYNC_ENGINE`. The values are `zero` and `powersync`. A build without the setting SHALL use Zero. A build with any other value SHALL fail before it produces output. A built app SHALL NOT change its engine at runtime.

#### Scenario: Setting absent

- **WHEN** the app is built without `PUBLIC_SYNC_ENGINE`
- **THEN** the build runs Zero for every read and write, as production does today

#### Scenario: Unknown value

- **WHEN** the app is built with `PUBLIC_SYNC_ENGINE=powersynk`
- **THEN** the build fails and names the allowed values

### Requirement: A Zero build contains nothing of PowerSync

A build that runs Zero SHALL contain no PowerSync code in its client output and SHALL NOT precache PowerSync's SQLite files. A device that installs it SHALL download nothing that belongs to PowerSync, open no local PowerSync database and make no request to the PowerSync service.

#### Scenario: Built output

- **WHEN** CI builds the app with the default engine
- **THEN** no client chunk, worker or precache entry of the output holds PowerSync code or PowerSync's wasm, and the build fails if any PowerSync module is resolved

#### Scenario: A signed-in device

- **WHEN** a member opens the Zero build and browses the guidebook
- **THEN** the device makes no request to the PowerSync service and creates no PowerSync database in its storage

### Requirement: Screens read through the same functions on either engine

A screen SHALL get its data through the same functions, with the same arguments and the same result shape, on either engine. A function a screen calls SHALL exist in both engines' builds.

#### Scenario: One screen, two builds

- **WHEN** a member opens an area page in a Zero build and in a PowerSync build of the same commit, over the same data
- **THEN** both pages show the same area, blocks, routes and grade chart

### Requirement: The PowerSync build runs without Zero

A build that runs PowerSync SHALL read the guidebook, profiles and search from PowerSync, SHALL send every write to the app server's write route, and SHALL read what the device does not hold from the app server. It SHALL start no Zero client and SHALL open no connection to zero-cache, so it works with zero-cache down.

#### Scenario: Logging an ascent in the PowerSync build

- **WHEN** a member logs an ascent in a PowerSync build
- **THEN** the write goes to the write route, and the ascent appears on the route page once PowerSync delivers the new row

#### Scenario: zero-cache is down

- **WHEN** a member uses a PowerSync build while zero-cache is unreachable
- **THEN** the guidebook, the feed, the inbox, comments and writes work, and the page sends nothing to zero-cache

### Requirement: Production builds Zero until the cutover

Production SHALL build with Zero until the cutover, the release that switches production to PowerSync. A preview deployment MAY build with `powersync`, on production data only as one branch's preview that is removed after its check.

#### Scenario: Production

- **WHEN** production is deployed before the cutover
- **THEN** it builds with Zero

#### Scenario: A preview on production data

- **WHEN** a preview builds with `powersync` against production data for a check on a real device
- **THEN** only that branch's previews carry production values, and once the check is done the values are removed and that branch's preview deployments deleted

### Requirement: No build carries measurement tools

No build SHALL contain the tools that measured the PowerSync trial: no runtime setting that changes the sync engine, its storage or its multi-tab mode, no page-load counter and no sync timeline. The engine switch is the only setting that picks an engine.

#### Scenario: Settings page in either build

- **WHEN** an app admin opens the sync settings page in either build
- **THEN** the page shows the sync service's health and no page-load count or sync timeline

#### Scenario: An old measurement setting

- **WHEN** a build runs with `PUBLIC_SYNC_ONLY_POWERSYNC=1` or `PUBLIC_POWERSYNC_VFS` set
- **THEN** the app behaves as it does without them

### Requirement: Admins see the sync service's health in either build

An app admin SHALL reach a sync health page from the settings in either build. It SHALL show the PowerSync service's state as the service reports it, or that the service is unreachable. Members who are not app admins SHALL NOT see the link and SHALL be refused by the page.

#### Scenario: Admin in the Zero build

- **WHEN** an app admin opens settings in a Zero build
- **THEN** the sync health link shows, and its page shows the PowerSync service's reported state

#### Scenario: Member without the admin permission

- **WHEN** a member who is not an app admin opens the sync health page's URL
- **THEN** the page refuses access

### Requirement: A PowerSync build carries no Zero client

A build that runs PowerSync SHALL fail when any module imports the Zero client, and SHALL name the module that did.

#### Scenario: A module reaches for the Zero client

- **WHEN** any module imports the Zero client and the app is built with `powersync`
- **THEN** the build fails and names the module

#### Scenario: The Zero build

- **WHEN** the app is built with Zero
- **THEN** the Zero client is imported as before and the build succeeds

### Requirement: Every pull request builds both engines

CI SHALL build the app with each engine on every pull request, so a change that breaks either build is seen before it merges.

#### Scenario: A change that breaks only the PowerSync build

- **WHEN** a pull request makes a new module import the Zero client
- **THEN** CI fails on the PowerSync build
