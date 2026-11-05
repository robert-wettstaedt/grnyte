# merges Specification

## Purpose

Lets region maintainers fold a duplicate area, block or route into the one that stays, keeping everything people
attached to either, and points every reference in stored text at the one that stays.

## Requirements

### Requirement: Two entities of the same level can merge

A person SHALL be able to merge a route into another route, a block into another block, or an area into another
area, in the same region. The entity the merge starts from is the source; the one picked is the survivor. Both SHALL
be live when the merge arrives.

#### Scenario: Merging duplicate routes

- **WHEN** a maintainer merges route "Kante" into route "Linke Kante" on the same block
- **THEN** only "Linke Kante" remains and "Kante" is no longer listed anywhere

#### Scenario: Different levels

- **WHEN** the survivor picker is open for a block
- **THEN** it offers only blocks of the same region, never areas or routes

#### Scenario: Two crossing merges

- **WHEN** one person merges A into B while another merges B into A
- **THEN** one merge goes through and the other is refused

### Requirement: Area merges keep the tree valid

An area SHALL NOT merge into an area beneath it. Two areas SHALL only merge when their children are of one kind: both
hold blocks, both hold areas, or at least one holds neither. A source's parkings SHALL move only when the survivor is
a sector.

#### Scenario: Survivor beneath the source

- **WHEN** a maintainer picks a sector inside the source area as the survivor
- **THEN** the merge is refused

#### Scenario: Blocks and sub-areas

- **WHEN** the source holds sub-areas and the survivor holds blocks
- **THEN** the merge is refused with the reason

### Requirement: The survivor picker lists nearby entities and searches the rest

While no search is typed, the survivor picker SHALL list only the source's nearby entities of the same level (its
siblings, or for a route the routes of its sector), and when there are none SHALL say to search by name. A search
SHALL cover the whole region as one list, showing that results are still arriving while they sync. Results already
shown SHALL NOT move; later matches append below them. The source SHALL NOT be offered.

#### Scenario: Duplicate under another sector

- **WHEN** a maintainer searches the picker for a block's name that exists in another sector
- **THEN** that block is offered as a survivor once it has synced

#### Scenario: Nothing nearby

- **WHEN** a maintainer opens Merge for a block that is alone in its sector
- **THEN** the picker lists no blocks and says to search the region by name

#### Scenario: Results arriving while tapping

- **WHEN** more matches sync in while the person is about to tap a shown result
- **THEN** the shown results stay where they are and the new ones appear below them

### Requirement: Differing values are chosen field by field

For each mergeable field where both sides hold different non-empty values, the person SHALL choose which value to
keep, with the survivor's value preselected. A field empty on one side SHALL take the other side's value without asking.
When no field differs, the choice step SHALL be skipped. Mergeable fields are name, set grade, description, first
ascent year and rating for routes; name, description and location for blocks; name and description for areas.

#### Scenario: Grade differs, description only on the source

- **WHEN** the survivor has set grade 7A and no description, and the source has 7A+ and a description
- **THEN** the person is asked only about the grade, and the survivor ends with the chosen grade and the source's description

#### Scenario: Nothing differs

- **WHEN** both sides hold the same values or one side is empty in every field
- **THEN** the flow goes straight from picking the survivor to the confirmation

#### Scenario: Two block locations

- **WHEN** both blocks have a location pin
- **THEN** the person picks one, and the block keeps exactly that one pin

### Requirement: Long values can be read in full

Each value offered in the choice step SHALL show at most two lines and SHALL be expandable in place to its full text.
Values SHALL be stacked one above the other, never side by side.

#### Scenario: A long description

- **WHEN** both descriptions run several paragraphs
- **THEN** each shows two lines with a control that expands it in place

### Requirement: The survivor inherits everything attached to the source

The survivor SHALL take over the source's ascents, photos and videos, topos, tags, first ascensionists, external links,
favorites, import references, open content reports, the activity on it (comments, and photos, parkings and first
ascensionists added to it) and, for blocks and areas, children, including deleted ones. Where both sides hold the
same attachment, the survivor SHALL keep one. The source's own creation, edits, moves and deletions SHALL stay with
the source.

#### Scenario: Both routes drawn on the same topo

- **WHEN** both routes have a line on the same topo and they merge
- **THEN** the survivor keeps its own line on that topo and the source's line is gone

#### Scenario: Blocks merge with their routes

- **WHEN** block 14 with three routes merges into block 12
- **THEN** block 12 holds its own routes and the three routes from block 14

#### Scenario: Both favorited by one person

- **WHEN** a person had favorited both routes
- **THEN** they hold one favorite, on the survivor

#### Scenario: One person logged both routes

- **WHEN** a person has a flash on the source and a redpoint on the survivor
- **THEN** both ascents are kept on the survivor

#### Scenario: Reported twice by one person

- **WHEN** a member has an open report on each side
- **THEN** their report on the survivor stays open and the other is closed, which tells them as any closing does

### Requirement: A route merged across blocks leaves the old block's topos

When the source route is on another block than the survivor, its topo lines on the source block's topos SHALL be
removed, and the confirmation SHALL say how many.

#### Scenario: Duplicate on a neighbouring block

- **WHEN** a route drawn on one topo of block 14 merges into a route on block 12
- **THEN** the confirmation names one topo line to be removed, and the survivor is drawn on no topo of block 14

### Requirement: A merge is confirmed with what it will move

Before merging, the person SHALL see the survivor and counts of what moves to it (ascents, photos, topos, children)
and of topo lines removed. Confirming SHALL be a destructive action. Dismissing it SHALL change nothing.

#### Scenario: Confirmation counts

- **WHEN** the source block's routes hold 12 ascents and the block 3 photos and 1 topo
- **THEN** the confirmation says 12 ascents, 3 photos and 1 topo move to the survivor

### Requirement: A merge cannot be undone

A merged source SHALL NOT be restorable through the app, and the confirmation SHALL say so.

#### Scenario: No undo offered

- **WHEN** a merge completes
- **THEN** the person is not offered Undo

### Requirement: Only people who may delete the source can merge

Merging SHALL require the right to delete the source and edit rights on the survivor. A person without both SHALL NOT
be offered Merge, and the server SHALL refuse a merge they send.

#### Scenario: A maintainer merges their own duplicate

- **WHEN** a maintainer merges a block they created into another block they may edit
- **THEN** the merge goes through

#### Scenario: A maintainer merges someone else's block

- **WHEN** a maintainer opens the action menu of a block another person created
- **THEN** it offers no Merge

### Requirement: References to a merged entity point at the survivor

References to the source in descriptions, ascent notes and comments SHALL be rewritten to the survivor as part of the
merge, online and offline alike once synced. History SHALL NOT be rewritten: a past edit keeps the text that was
written. The rewrite SHALL NOT appear as an edit in anyone's history.

#### Scenario: A reference in a description

- **WHEN** a description references block A and A merges into B
- **THEN** the reference reads as block B and leads to B, and the description's history shows no new edit

#### Scenario: A reference in a comment

- **WHEN** a comment references route "Kante" and it merges into "Linke Kante"
- **THEN** the comment shows "Linke Kante"

#### Scenario: A past edit

- **WHEN** someone opens an earlier description edit that added a reference to A
- **THEN** it shows the text as it was written

### Requirement: A merged entity's address is not found

Opening the address of a merged source SHALL show not found, as for a deleted entity. A merged source SHALL NOT be
restorable by any request.

#### Scenario: An old bookmark

- **WHEN** someone opens the address of route "Kante" after it merged into "Linke Kante"
- **THEN** they see not found

#### Scenario: A forged restore

- **WHEN** a request asks to restore a merged source
- **THEN** the server refuses it, saying it was merged, and the source stays retired

#### Scenario: A moderation reversal on a merged source

- **WHEN** a moderation decision on a row that was later merged is reversed
- **THEN** the merged row still does not come back

### Requirement: A merge is recorded on the survivor

The survivor's history SHALL show the merge with the source's name. It SHALL NOT show the source's own creation,
edits, moves or deletions, which describe a row that no longer exists, and they SHALL NOT count as edits of the
survivor.

#### Scenario: History after a merge

- **WHEN** someone opens the survivor's history after a merge
- **THEN** it shows the merge naming the source, and none of the edits that were made to the source before it

#### Scenario: A duplicate that was moved before the merge

- **WHEN** block A is moved to another sector and then merged into block D
- **THEN** D's history shows the merge and no move, because D itself never moved
