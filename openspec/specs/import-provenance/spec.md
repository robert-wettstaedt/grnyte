# import-provenance Specification

## Purpose

Records which line of an external source (a guidebook edition, another platform) each imported area, block and route
came from, and what the import wrote, so a later import can match the same rows and tell person-made edits apart.

## Requirements

### Requirement: A ref points at exactly one entity

Every import ref SHALL point at exactly one area, block or route, never none and never two.

#### Scenario: Ref with two targets is refused

- **WHEN** a ref is written with both a block and a route set
- **THEN** the database refuses the write

#### Scenario: Ref with no target is refused

- **WHEN** a ref is written with no area, block or route
- **THEN** the database refuses the write

### Requirement: A ref names its source and line

Every ref SHALL carry a source label (for example `boulderappell-2026`) and a line reference within that source. For a
guidebook the line reference is the stable page-and-line anchor of the printed line (`y95-123`), for a block or area the
anchor of its heading.

#### Scenario: Ref without a source is refused

- **WHEN** a ref is written with an empty source or line reference
- **THEN** the database refuses the write

### Requirement: A ref keeps what the import wrote

Every ref SHALL keep a snapshot of the values the import wrote to its entity, so a later run can compare the entity's
current values with it.

#### Scenario: Person-made edit is visible

- **WHEN** a route was imported with grade 7A and a person later changed it to 7A+
- **THEN** reading the route's ref returns 7A as the imported grade beside the route's current 7A+

### Requirement: One line maps to one entity per kind

Within one source, a line reference SHALL point at no more than one area, one block and one route.

#### Scenario: Same line twice is refused

- **WHEN** a second route ref is written with the same source and line as an existing route ref
- **THEN** the database refuses the write

#### Scenario: Block and route on one line are allowed

- **WHEN** a block and its only route are both anchored on the same printed line
- **THEN** both refs are stored

### Requirement: An entity may hold several refs

An entity SHALL be able to hold any number of refs: across sources, across editions of one source, and within one
source.

#### Scenario: Two editions

- **WHEN** a route was imported from `boulderappell-2026` and later matched in `boulderappell-2030`
- **THEN** the route holds both refs and the 2026 ref is unchanged

#### Scenario: Gebiet printed twice

- **WHEN** one area stands for a Gebiet the book prints in two places
- **THEN** the area holds one ref per printed heading in the same source

### Requirement: Refs outlive soft deletes

A soft-deleted entity SHALL keep its refs. Refs SHALL be removed only when their entity row is removed from the
database.

#### Scenario: Deleted route stays matched

- **WHEN** a person deletes an imported route and the next edition is imported
- **THEN** the deleted route's ref still matches its line, so the import does not create the route again

#### Scenario: Hard delete removes refs

- **WHEN** an entity row is removed from the database
- **THEN** its refs are removed with it

### Requirement: Refs follow region operations

Refs SHALL belong to their entity's region: purging a region removes them, and moving entities to another region moves
their refs along.

#### Scenario: Region purge

- **WHEN** a region is purged
- **THEN** no ref of that region remains

#### Scenario: Area moved to another region

- **WHEN** an area with its blocks and routes moves to another region
- **THEN** their refs carry the new region

### Requirement: Refs never reach a client

No client SHALL be able to read or write refs. Only the import's server-side database connection does.

#### Scenario: Signed-in member

- **WHEN** a member of the region queries through the app or sync
- **THEN** no ref is returned and no write to refs is accepted
