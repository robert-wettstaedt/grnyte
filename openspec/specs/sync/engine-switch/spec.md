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

### Requirement: The PowerSync build is a local preview until PowerSync writes

Until PowerSync has its own write path, a build that runs PowerSync SHALL read the guidebook, profiles and search from PowerSync and SHALL send every write, and read the feed, inbox, comments and reactions, through Zero. No deployment SHALL build with `powersync` in that time.

#### Scenario: Logging an ascent in the PowerSync build

- **WHEN** a member logs an ascent in a local PowerSync build
- **THEN** the write goes through Zero, and the ascent appears on the route page once PowerSync delivers the new row

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
