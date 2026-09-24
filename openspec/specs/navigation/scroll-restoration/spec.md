# scroll-restoration Specification

## Purpose

Defines where a screen's scroll position lands when the app navigates, so that moving forward starts
at the top, going back returns a reader to where they were, and staying on the same screen does not
move them.

## Requirements

### Requirement: Arriving at a different screen starts at the top

When the app navigates to a screen other than the one the reader is on, that screen SHALL be shown
scrolled to its top, regardless of how far the previous screen was scrolled. This holds whether the
navigation adds a history entry or replaces the current one.

A navigation that adds an entry without changing the screen is covered below, not here.

This SHALL hold whether or not the two screens share a scroll container, and SHALL NOT depend on the
destination being taller than the viewport.

#### Scenario: Two screens sharing a scroll container

- **WHEN** a reader scrolls a screen down and follows a link to another screen that is rendered
  inside the same scroll container
- **THEN** the destination is shown from its top

#### Scenario: The destination is shorter than the viewport

- **WHEN** a reader scrolls a screen down and follows a link to a screen whose content fits the
  viewport
- **THEN** the destination is shown from its top, and no scrollbar or scrolled state is visible

#### Scenario: Moving between unrelated sections

- **WHEN** a reader scrolls a screen down and navigates to a screen in a different section of the
  app
- **THEN** the destination is shown from its top

### Requirement: Going back restores where the reader was

When a reader returns to a history entry they have previously scrolled, the app SHALL restore that
entry's scroll position rather than showing the screen from its top.

The restored position SHALL be the position that entry had when the reader last left it, and SHALL
be correct for each entry independently when several scrolled entries are traversed.

This SHALL NOT apply to a surface whose height the reader controls, which is covered separately
below.

#### Scenario: Back to a scrolled screen

- **WHEN** a reader scrolls a screen down, navigates away, and then goes back
- **THEN** the screen is shown at the scroll position it had when they left it

#### Scenario: Forward again after going back

- **WHEN** a reader goes back to a restored screen and then goes forward again
- **THEN** the screen they return to is shown at the scroll position it had when they left it

#### Scenario: Several scrolled entries in the stack

- **WHEN** a reader scrolls screen A, navigates to screen B, scrolls B, navigates to screen C, and
  then goes back twice
- **THEN** B is shown at B's position and A is shown at A's position

#### Scenario: A position that was never scrolled

- **WHEN** a reader goes back to an entry they never scrolled
- **THEN** the screen is shown from its top

#### Scenario: The reader scrolls while a restore is still settling

- **WHEN** a reader returns to a scrolled screen whose content is still arriving, and scrolls it
  themselves before it has settled
- **THEN** the app stops restoring and leaves them where they scrolled to

#### Scenario: Navigating away again before a restore has settled

- **WHEN** a reader returns to a scrolled screen whose content is still arriving, and navigates on to
  another screen before it has settled
- **THEN** the screen they navigate to is shown from its top and is never pulled to the earlier
  screen's position

### Requirement: Staying on the same screen does not move the reader

When a navigation leaves the reader on the screen they were already on, the scroll position SHALL be
left untouched. This covers navigations that change the URL to mirror state on that screen, whether
they add a history entry or replace the current one.

This also covers a navigation the app performs on the reader's behalf to resolve a link to its
canonical screen: the reader did not choose to leave anything, so the screen they reach keeps the
position it establishes for itself.

#### Scenario: Paging the media viewer

- **WHEN** a reader opens the media viewer from a scrolled screen and pages to a sibling file
- **THEN** the screen behind the viewer keeps its scroll position, and closing the viewer returns
  the reader to where they were

#### Scenario: Mirroring page state into the query string

- **WHEN** a screen writes its own state into the query string while the reader is scrolled
- **THEN** the reader is not moved

#### Scenario: Opening a link that resolves to a row on another screen

- **WHEN** a reader opens a link to a single item whose canonical place is a row within a longer
  list, and the app forwards them to that list
- **THEN** the list is shown scrolled to that row, not from its top

#### Scenario: Finishing a task that replaces the screen it was performed on

- **WHEN** a reader scrolls a long form, submits or cancels it, and the app replaces that screen with
  the entity's own screen rather than adding an entry
- **THEN** the entity's screen is shown from its top, not at the form's offset

### Requirement: Entering the app does not force a position

When the app is entered directly rather than navigated to within the app, whether by a shared link,
a notification, or a cold start, the app SHALL NOT override the position the browser establishes.

#### Scenario: Cold start on a deep link

- **WHEN** a reader opens a link to a screen in a fresh tab
- **THEN** the screen is shown from its top, and the app performs no additional scrolling

#### Scenario: Back into the app from another site

- **WHEN** a reader navigates away to another site and then goes back into a screen they had
  scrolled
- **THEN** the screen is shown at the scroll position it had when they left it

### Requirement: The rule is uniform across scrolling surfaces

Every surface in the app that scrolls its own content SHALL follow the requirements above. No
surface SHALL have its own separate scroll rule, and no individual navigation call SHALL be
responsible for positioning the destination.

#### Scenario: Moving between sibling entities

- **WHEN** a reader scrolls an entity's screen and uses the previous or next control to move to a
  sibling entity
- **THEN** the sibling is shown from its top, by the same rule that governs any other forward
  navigation

#### Scenario: A sheet or panel that scrolls its own content

- **WHEN** a reader scrolls the content of a sheet or panel and navigates it to another entity
- **THEN** that content is shown from its top

### Requirement: A surface whose height the reader controls always resets

Where a reader controls both how tall a surface is and how far its content is scrolled, those two
form a single position. The app SHALL NOT restore one without the other. Until both are restored
together, such a surface SHALL be shown from its top on every navigation, including a return to a
history entry the reader had scrolled.

#### Scenario: Returning to a sheet that was scrolled

- **WHEN** a reader scrolls a sheet's content, opens one of its items, and then goes back
- **THEN** the sheet's content is shown from its top rather than part-scrolled

#### Scenario: Returning to a sheet left at a reduced height

- **WHEN** a reader shrinks a sheet, navigates away, and then goes back
- **THEN** the reader is never shown content scrolled to an offset the surface's height cannot
  account for
