# route-editing Specification

## Purpose

Defines what a person can change about a route while drawing lines in the topo editor, what they see
while a route's details are still arriving, when those actions are offered at all, and how such an
edit relates to the line work they have not saved yet.

## Requirements

### Requirement: A route's details can be changed without leaving the editor

While a route is selected in the topo editor, the editor SHALL offer an action that opens a form for
changing that route's details, and SHALL NOT require the person to navigate away from the editor to
reach it.

Opening, using or dismissing that form SHALL NOT discard any line work the person has not saved, and
SHALL NOT prompt them to.

#### Scenario: Naming a route just drawn

- **WHEN** a person draws a line for a nameless route, selects it, and opens its details form
- **THEN** the form opens over the editor, the drawn line is still there afterwards, and at no point
  are they asked whether to discard their work

#### Scenario: Dismissing without saving

- **WHEN** a person opens the details form and dismisses it without saving
- **THEN** the route is unchanged and the editor returns to the selected route with its lines intact

### Requirement: The editor describes a route the same way wherever it asks

Every form in the topo editor that asks for a route's details SHALL offer the same set of details as
the rest of the app: name, grade, rating, tags, description, first ascent year and first
ascensionists. This SHALL hold for creating a route and for changing an existing one.

Those forms SHALL NOT offer to attach media to a route. The editor's own photo handling covers
photos of the rock; media belonging to a route is added where that route's media lives.

#### Scenario: Creating and then changing a route

- **WHEN** a person creates a route from inside the editor and later opens that route's details form
  in the same editor
- **THEN** both forms ask for the same details, and nothing they entered on creation is missing from
  the second form

#### Scenario: No media picker in the editor

- **WHEN** a person opens either route form inside the topo editor
- **THEN** no control for attaching photos or videos to the route is shown

### Requirement: A details form never opens on partial data

A form for changing an existing route SHALL NOT be filled in until every detail it can submit has
been loaded, including the route's tags and first ascensionists. Until then it SHALL show that it is
still loading, and any control that would save it SHALL be unavailable.

When the person is offline and the missing details cannot arrive, the form SHALL say so rather than
show a loading state that can never resolve.

A save SHALL be refused if the tags or first ascensionists the form loaded are no longer what is
stored.

#### Scenario: Opening before the details have arrived

- **WHEN** a person opens the details form for a route whose tags and first ascensionists have not
  synced yet
- **THEN** the form shows a loading state, its save control is unavailable, and it fills in only
  once those details are present

#### Scenario: Saving does not silently drop details

- **WHEN** a person opens a route's details form, changes only its name, and saves
- **THEN** the route keeps every tag and first ascensionist it had

#### Scenario: Offline with details missing

- **WHEN** a person is offline and opens the details form for a route whose related details are not
  held locally
- **THEN** the form tells them the details are unavailable offline rather than loading indefinitely

### Requirement: Route details are saved immediately, separately from line work

Saving a route's details SHALL take effect immediately and SHALL NOT wait for, or be undone by, the
editor's separate save of its line work.

A person who saves route details and then discards their unsaved line work SHALL keep the saved
details.

#### Scenario: Discarding lines after saving details

- **WHEN** a person renames a route, saves it, draws a line, and then leaves the editor answering
  that the unsaved line work should be discarded
- **THEN** the rename stands and only the line work is lost

#### Scenario: Saving details does not save lines

- **WHEN** a person saves a route's details while lines are unsaved
- **THEN** the editor still reports unsaved line work and still asks before leaving

### Requirement: The action is offered only to those who may take it

The action for changing a route's details SHALL be offered only when the person is permitted to
change that route, and SHALL be absent otherwise rather than shown and then refused.

#### Scenario: A person without permission

- **WHEN** a person who may not change a route selects it in the editor
- **THEN** no action for changing its details is shown

### Requirement: Route details are reachable from the keyboard

The editor SHALL provide a single-key shortcut that opens the details form for the currently selected
route. That shortcut SHALL do nothing when no route is selected, and SHALL NOT act while the person
is typing in a field.

Dismissing the form with the key that closes surfaces SHALL close the form only, and SHALL NOT also
clear the route selection.

#### Scenario: Opening from the keyboard

- **WHEN** a person selects a route and presses the details shortcut
- **THEN** the details form opens for that route

#### Scenario: The shortcut with nothing selected

- **WHEN** no route is selected and a person presses the details shortcut
- **THEN** nothing opens and the editor is unchanged

#### Scenario: Dismissing the form keeps the selection

- **WHEN** a person opens the details form and dismisses it with the key that closes surfaces
- **THEN** the form closes and the same route remains selected

### Requirement: A nameless route is described consistently

A route with no stored name SHALL be described in the topo editor by the same wording the rest of the
app uses for a nameless route.

#### Scenario: A route created without a name

- **WHEN** a person creates a route in the editor without giving it a name and selects it
- **THEN** it is described exactly as a nameless route is described elsewhere in the app
