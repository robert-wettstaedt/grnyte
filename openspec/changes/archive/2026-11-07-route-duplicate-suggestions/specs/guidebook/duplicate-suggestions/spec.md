# Spec Delta

## Purpose

Helps people notice that a route already exists while they are adding it, so fewer duplicates need merging later, without ever stopping them from adding a route that shares a name.

## ADDED Requirements

### Requirement: Route creation suggests similar routes

While a person types a name in a form that creates a route, the form SHALL list existing live routes of the block's region whose names are similar. A form editing an existing route SHALL NOT show suggestions.

#### Scenario: Typing a name that exists

- **WHEN** a maintainer types "Karma" on the add-route form and the region has a route called "Karma"
- **THEN** that route is listed under the name field

#### Scenario: New route in the topo editor

- **WHEN** a maintainer types a similar name in the topo editor's new-route step
- **THEN** the matching routes are listed under the name field

#### Scenario: Editing a route

- **WHEN** a maintainer changes a name on the edit-route form
- **THEN** no suggestions appear

#### Scenario: Merged or deleted route

- **WHEN** the only route with that name has been merged or deleted
- **THEN** it is not suggested

### Requirement: Suggestions stay inside the region

Suggestions SHALL only come from the region of the block the route is being added to, even when the person belongs to other regions.

#### Scenario: Same name in another region

- **WHEN** a person who belongs to two regions types a name that exists only in the other region
- **THEN** no suggestion appears

### Requirement: Names are compared without regard to form

Before comparing, names SHALL be treated as equal regardless of case, accents, punctuation and spacing, and "ß" SHALL equal "ss".

#### Scenario: Accents and case

- **WHEN** a person types "el camaleon" and "El camaleón" exists
- **THEN** it is suggested as an exact match

#### Scenario: Spacing and punctuation

- **WHEN** a person types "Hauruck" and "Hau Ruck" exists, or "Uboot" and "U-Boot" exists
- **THEN** it is suggested as an exact match

#### Scenario: German spelling of an umlaut

- **WHEN** a person types "Muenchhausen" and "Münchhausen" exists
- **THEN** it is suggested as a typo match

### Requirement: Exact and typo matches apply across the region

An exact match or a typo match SHALL be suggested from anywhere in the region. Names SHALL be compared word by word and SHALL have the same number of words. A word of 4 to 7 characters SHALL allow one edit, and a word of 8 or more SHALL allow two. Swapping two neighbouring letters SHALL count as one edit.

#### Scenario: Typo in another sector

- **WHEN** a person types "Wanfred" and "Wahnfred" exists in another sector
- **THEN** it is suggested

#### Scenario: Swapped letters

- **WHEN** a person types "Einseidler" and "Einsiedler" exists
- **THEN** it is suggested

#### Scenario: Short words must match exactly

- **WHEN** a person types "Koi" and only "Kai" exists
- **THEN** it is not suggested

#### Scenario: Different word

- **WHEN** a person types "Left Exit" and only "Right Exit" exists
- **THEN** it is not suggested as a typo match

### Requirement: Numbers in a name must match exactly

A word containing a digit SHALL NOT match through a typo, so numbered routes do not suggest each other across the region.

#### Scenario: Numbered siblings

- **WHEN** a person types "Problem 1" and only "Problem 2" exists in another sector
- **THEN** it is not suggested

### Requirement: A different first letter counts only on long words

A word whose first letter differs SHALL match as a typo only when it has 8 or more characters. Such a match SHALL rank below other typo matches.

#### Scenario: Short word with another first letter

- **WHEN** a person types "Hecke" and only "Zecke" exists
- **THEN** it is not suggested

#### Scenario: Long word with another first letter

- **WHEN** a person types "Vinterreise" and "Winterreise" exists
- **THEN** it is suggested, below any other typo match

### Requirement: Nearby routes also match on shared words

A route on the same block or in the block's sector SHALL also match when its name starts with what was typed, from 3 characters, or shares an uncommon word of 3 or more characters without digits. A word SHALL be uncommon when at most 2 route names in the region contain it. Routes elsewhere SHALL NOT match this way.

#### Scenario: Shared word nearby

- **WHEN** a person types "Zecke" and "Zecke links" exists in the same sector
- **THEN** it is suggested

#### Scenario: Shared word far away

- **WHEN** a person types "Zecke" and "Zecke links" exists only in another sector
- **THEN** it is not suggested

#### Scenario: Common word

- **WHEN** a person types "The Corner" and the region has many routes starting with "The"
- **THEN** those routes are not suggested because of "The"

#### Scenario: Still typing

- **WHEN** a person has typed "Zec" and "Zecke" exists on the same block
- **THEN** it is suggested

### Requirement: Very short names match only on the same block

A name of fewer than 3 characters SHALL be suggested only as an exact match on the same block.

#### Scenario: Short name on this block

- **WHEN** a person types "A" and this block has a route called "A"
- **THEN** it is suggested

#### Scenario: Short name elsewhere

- **WHEN** a person types "A" and only another block has a route called "A"
- **THEN** it is not suggested

### Requirement: Suggestions are few and ordered by likelihood

The form SHALL show at most three suggestions, ordered exact, then typo, then first-letter typo, then shared word or start of name. Within one kind, the same block SHALL come first, then the same sector, then the rest of the region.

#### Scenario: More than three matches

- **WHEN** five routes match
- **THEN** only the three most likely are shown, with no way to show more

#### Scenario: Same match, different place

- **WHEN** two routes match exactly, one on this block and one in another sector
- **THEN** the one on this block comes first

### Requirement: Each suggestion shows enough to recognise the route

Each suggestion SHALL show the route's name, grade, block and area, so a person can tell whether it is the same route. Tapping a suggestion SHALL NOT change the name field.

#### Scenario: Same name in another sector

- **WHEN** a suggested route is on another block
- **THEN** its row names that block and area

#### Scenario: Tapping a row

- **WHEN** a person taps a suggestion
- **THEN** the typed name stays as it was

#### Scenario: Route with a long description

- **WHEN** a suggested route has a description
- **THEN** its row in the list leaves the description out, and the preview shows it

### Requirement: The list stays steady while typing

While the name changes, the shown suggestions SHALL stay until the next ones are ready, so the list does not collapse between letters. The list SHALL close only when nothing matches. Tapping a suggestion SHALL NOT move it before the tap lands.

#### Scenario: Typing another letter

- **WHEN** a person types another letter and new matches are still loading
- **THEN** the current suggestions stay on screen until the new ones replace them

#### Scenario: Name cleared

- **WHEN** a person clears the name while the field has focus
- **THEN** the list closes

#### Scenario: Tapping with the keyboard open

- **WHEN** a person taps a suggestion while the name field has focus
- **THEN** the list stays in place and the preview opens

### Requirement: An exact match on the same block is stated plainly

When a suggestion is an exact match on the same block, the form SHALL say that this block already has a route of that name, in place of the usual heading.

#### Scenario: Exact match here

- **WHEN** a person types "Karma" and this block has a route called "Karma"
- **THEN** the form says this block already has a route called Karma

#### Scenario: Exact match elsewhere

- **WHEN** the exact match is on another block
- **THEN** the usual heading is shown

### Requirement: Suggestions never block adding a route

A person SHALL be able to submit the form whatever is suggested.

#### Scenario: Adding a route with the same name

- **WHEN** a person submits a name that exactly matches a route on the same block
- **THEN** the route is created

### Requirement: The form makes no claim about absence

The form SHALL show nothing when there is no match, and SHALL NOT state that no similar route exists, whether or not the region's names have finished loading. Suggestions SHALL NOT show a loading state or hold the screen's syncing indicator.

#### Scenario: No match

- **WHEN** a typed name matches nothing
- **THEN** nothing is added to the form

#### Scenario: Offline

- **WHEN** a person is offline with only some of the region's routes on hand
- **THEN** matches from those routes are shown, and nothing says the list is complete

### Requirement: The list only changes while the name field has focus

Suggestions SHALL update only while the name field has focus, plus once after focus leaves for a name typed under focus that had not settled yet, so the list never describes an earlier name than the field. After that, the shown list SHALL hold until the field has focus again, so later data cannot move the fields below it.

#### Scenario: Names arrive after moving on

- **WHEN** a person has moved to the grade picker and more route names finish loading
- **THEN** the form does not shift

#### Scenario: Leaving right after typing

- **WHEN** a person changes the name and leaves the field before the typing has settled
- **THEN** the list catches up with the name in the field once, and then holds

#### Scenario: Returning to the field

- **WHEN** a person focuses the name field again
- **THEN** the list reflects the current name and every route now on hand

### Requirement: A preview keeps the form intact

Tapping a suggestion SHALL open a preview of the route showing its description and tags as well as what the row shows. Closing the preview SHALL return to the form with everything entered still in place, including media being uploaded.

#### Scenario: Not the same route

- **WHEN** a person previews a suggestion and closes it
- **THEN** all form fields hold what they held before

### Requirement: The add page's preview can go to the route

On the add-route page, the preview SHALL offer going to the route's page, which leaves the form.

#### Scenario: It is the same route

- **WHEN** a person chooses to show the details from the preview
- **THEN** the route's page opens

### Requirement: The topo editor's preview never leaves the editor

In the topo editor, the preview SHALL NOT offer navigation. For a route of the same block not yet on the current photo, it SHALL offer adding a line to that route. Any other route SHALL be shown without an action.

#### Scenario: Same block, not on this photo

- **WHEN** a person chooses to add a line from the preview
- **THEN** the sheets close and that route is selected for drawing, with existing unsaved lines kept

#### Scenario: Same block, already on this photo

- **WHEN** a person previews a route of this block that already has a line on this photo
- **THEN** the preview offers no action

#### Scenario: Another block

- **WHEN** a person previews a route of another block
- **THEN** the preview offers no action and closing it returns to the form
