# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: The PowerSync build is a local preview until PowerSync writes`
- TO: `### Requirement: The PowerSync build is a local preview until it runs without Zero`

## MODIFIED Requirements

### Requirement: The PowerSync build is a local preview until it runs without Zero

A build that runs PowerSync SHALL read the guidebook, profiles and search from PowerSync, SHALL send every write to the app server's write route, and SHALL read what the device does not hold from the app server. Until such a build starts no Zero client at all, no deployment SHALL build with `powersync`.

#### Scenario: Logging an ascent in the PowerSync build

- **WHEN** a member logs an ascent in a local PowerSync build
- **THEN** the write goes to the write route, and the ascent appears on the route page once PowerSync delivers the new row

#### Scenario: A deployment

- **WHEN** any deployment builds the app
- **THEN** it builds with Zero

## ADDED Requirements

### Requirement: A PowerSync build takes on no new use of the Zero client

A build that runs PowerSync SHALL fail when a module that is not on the recorded list of remaining users imports the Zero client. The list SHALL only shrink: an entry whose module no longer imports the Zero client SHALL fail the tests until it is deleted.

#### Scenario: A new module reaches for the Zero client

- **WHEN** a module that is not on the list imports the Zero client and the app is built with `powersync`
- **THEN** the build fails and names the module

#### Scenario: A stale entry

- **WHEN** a module on the list stops importing the Zero client
- **THEN** the tests fail until its entry is deleted

### Requirement: Every pull request builds both engines

CI SHALL build the app with each engine on every pull request, so a change that breaks either build is seen before it merges.

#### Scenario: A change that breaks only the PowerSync build

- **WHEN** a pull request makes a new module import the Zero client
- **THEN** CI fails on the PowerSync build
