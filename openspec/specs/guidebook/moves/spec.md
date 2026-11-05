# moves Specification

## Purpose

Lets region maintainers put an area, block or route under a different parent inside its region, alone or several
at once, without losing anything attached to it.

## Requirements

### Requirement: An entity can move to a new parent in its region

A person SHALL be able to move a route to another block, a block to a sector or an untyped area, and an area under
an area that is not a sector or to the top level. The destination SHALL be live and in the entity's own region. The
moved entity's children, ascents, photos, comments and history SHALL move with it; topo lines follow the topo rule
below.

#### Scenario: Block to another sector

- **WHEN** a maintainer moves block 12 from sector North to sector South
- **THEN** block 12, its routes and their ascents are shown under South and no longer under North

#### Scenario: Area to the top level

- **WHEN** a maintainer moves an area nested under another area to the top level
- **THEN** it appears among the region's top-level areas with all its sectors and blocks

#### Scenario: Browsing to the destination

- **WHEN** a maintainer opens Move for a route
- **THEN** the picker opens at the route's current sector with its blocks listed, lets them step up to other areas and sectors, and offers a name search on top

#### Scenario: Destination in another region

- **WHEN** the destination picker is open
- **THEN** it offers no area or block from another region

#### Scenario: Destination deleted meanwhile

- **WHEN** a move names a destination that was deleted, or sits under a deleted area, after the picker showed it
- **THEN** the move is refused and nothing changes

### Requirement: The destination must accept the entity

A block SHALL only move into a sector or an untyped area, and an area SHALL only move under an area that is not a
sector. An area SHALL NOT move under itself or anything beneath it. Moving an entity to its current parent SHALL not
be offered and SHALL change nothing if sent.

#### Scenario: Area into its own descendant

- **WHEN** a maintainer picks a sector inside the area being moved as its new parent
- **THEN** the move is refused and nothing changes

#### Scenario: Block into an area holding areas

- **WHEN** a maintainer moving a block opens an area that holds sub-areas
- **THEN** they can go on into its sectors, but the area itself cannot be confirmed as the destination

#### Scenario: Same parent sent anyway

- **WHEN** a request moves a block to the area it is already in
- **THEN** nothing changes, including the area's block order

### Requirement: A destination is opened before it is confirmed

Tapping a place in the picker SHALL open it and SHALL NOT move anything. An opened sector SHALL list its blocks and
an opened block its routes, read-only, so the person sees what is already there. A search result SHALL open its place
rather than move there. Places that cannot take what moves SHALL be shown dimmed, with a reason only where their type
does not say why.

#### Scenario: Opening a sector before moving a block into it

- **WHEN** a maintainer moving a block taps sector South
- **THEN** South opens and lists its blocks, and nothing has moved

#### Scenario: Opening a search result

- **WHEN** a maintainer searches the picker and taps a result
- **THEN** that place opens with its location shown, and nothing moves until they confirm

### Requirement: One confirm control does the move

One confirm control, fixed at the bottom of the picker, SHALL do the move and name the opened destination. Where the
opened place cannot take what moves, or a search is typed, it SHALL NOT move anything and SHALL say what to do instead.

#### Scenario: Confirming an opened sector

- **WHEN** a maintainer moving a block has sector South open
- **THEN** the confirm control reads "Move to South" and moves the block there

#### Scenario: A level that cannot take the block

- **WHEN** a maintainer moving a block is looking at an area that holds sub-areas
- **THEN** the confirm control does not move anything and tells them to open a sector first

### Requirement: Only people who may edit both sides can move

Moving SHALL require edit rights on the entity and on the destination, or edit rights in the region for a move to the
top level. A person without them SHALL NOT be offered Move.

#### Scenario: A member without edit rights

- **WHEN** a plain member opens a block's action menu
- **THEN** it offers no Move

#### Scenario: A forged move

- **WHEN** a request moves a block the caller may not edit
- **THEN** the server refuses it and nothing changes

### Requirement: A moved block takes the last slot

A moved block SHALL take the last slot in its new area, and the blocks left behind SHALL close the gap so their
order has no holes. Several blocks moved together SHALL keep their relative order.

#### Scenario: Two blocks moved together

- **WHEN** blocks in slots 2 and 5 of North move to South, which holds 3 blocks
- **THEN** they take South's slots 4 and 5 in their previous order and North's remaining blocks are numbered without gaps

### Requirement: A moved route leaves its old block's topos

A route moved to another block SHALL no longer be drawn on the old block's topos. The confirmation SHALL say how
many topo lines will be removed, and the move SHALL be refused if that number no longer matches when it arrives.

#### Scenario: Route drawn on a topo

- **WHEN** a maintainer moves a route that is drawn on one topo of its block
- **THEN** the confirmation names one topo line to be removed, and after the move the route shows no topo line from the old block anywhere

#### Scenario: A line drawn meanwhile

- **WHEN** someone draws the route on another topo after the confirmation showed one line
- **THEN** the move is refused and the person is asked to review it again

### Requirement: Several children can move in one step

On a list of children (blocks in a sector, routes on a block, areas in an area) a person who may edit SHALL be able
to select several entries and move them all to one destination. Selection SHALL apply to one list at a time.

#### Scenario: Moving three routes

- **WHEN** a maintainer selects three routes on block 12 and moves them to block 14
- **THEN** all three routes are on block 14 and block 12 lists none of them

### Requirement: A move can be undone

After a move the person SHALL be offered Undo, which puts every moved entity back under its previous parent and,
for blocks, in its previous slot. Topo lines removed by the move SHALL NOT come back.

#### Scenario: Undo a block move

- **WHEN** a maintainer moves block 12 out of slot 3 and taps Undo
- **THEN** block 12 is back in its old sector in slot 3

### Requirement: A move is recorded as an edit

A move SHALL appear in the moved entity's history as a change of parent naming both the old and the new parent,
and SHALL be delivered to people who follow guidebook edits like any other edit.

#### Scenario: History after a move

- **WHEN** someone opens the history of a block that was moved from North to South
- **THEN** it shows the move from North to South with who did it and when
