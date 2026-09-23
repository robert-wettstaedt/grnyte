## Purpose

What going back means inside the app: which screens back can reach, what finishing or abandoning a
task does to the reader's trail, and where back goes when nothing of the app sits behind the current
screen.

## ADDED Requirements

### Requirement: Back means the same thing however it is invoked

Back SHALL reach the same destination whichever affordance invokes it: the header's back control,
the browser's back button, the platform's back gesture or hardware button, and the keyboard
shortcut. The single exception is a screen with no in-app trail behind it, covered by its own
requirement below.

A reader cannot tell these apart, so the app SHALL NOT define a back that is correct in one of them
and wrong in the others.

#### Scenario: The header control and the platform gesture agree

- **WHEN** a reader is on any screen that has an in-app trail behind it
- **THEN** using the header's back control and using the platform's back gesture reach the same
  screen

### Requirement: Finishing a task retires the screen that hosted it

When a task completes, the screen the reader performed it on SHALL NOT be reachable by going back.
Going back from where the task left the reader SHALL reach whatever was showing before the task
began.

A task here is any screen a reader enters to do one thing and leaves on completing it: logging an
ascent, adding or editing a route, block, area or parking, editing a region, or any other form.

#### Scenario: Logging an ascent

- **WHEN** a reader opens a route, logs an ascent, saves, and lands back on the route
- **THEN** going back reaches whatever they were on before opening the route, and never the Log
  ascent screen

#### Scenario: A task that ends on something newly created

- **WHEN** a reader adds a route from a block and is taken to the new route
- **THEN** going back reaches the block, and never the add-route screen

#### Scenario: Back never appears to do nothing

- **WHEN** a reader goes back from where any completed task left them
- **THEN** the screen changes

### Requirement: Abandoning a task retires it too

A task the reader leaves without completing SHALL be retired exactly as a completed one is. Going
back from the screen they land on SHALL NOT return them to the abandoned task.

#### Scenario: Cancelling out of a form

- **WHEN** a reader opens a form, cancels, and lands back on the previous screen
- **THEN** going back from there does not reopen the form

### Requirement: Dismissing a temporary surface retires it

A surface the reader dismisses rather than navigates away from, such as an explore sheet or a
fullscreen media viewer, SHALL NOT be reachable by going back once dismissed. Leaving a task SHALL
NOT reopen such a surface either.

#### Scenario: Closing an explore sheet

- **WHEN** a reader opens a block from the map and closes the sheet
- **THEN** going back does not reopen it

#### Scenario: Leaving a task does not reopen a dismissed viewer

- **WHEN** a reader had a media viewer open on a screen, closed it, performed a task, and the task
  completes back on that screen
- **THEN** the media viewer is not reopened

### Requirement: Leaving after a delete does not strand the reader on the deleted screen

When a delete takes the reader away from the screen showing the deleted thing, that screen SHALL NOT
be the entry immediately behind them.

Entries further back may still point at deleted things, and that is permitted: a delete can be
undone from the confirmation that follows it, so such an entry is not necessarily stale, and
anything can be deleted by another member at any time. Screens SHALL therefore report a thing that
is gone rather than failing.

#### Scenario: Deleting from a detail screen

- **WHEN** a reader deletes something and is taken to its parent
- **THEN** going back does not return them to the screen for the deleted thing

#### Scenario: Reaching a screen whose thing is gone

- **WHEN** a reader reaches a screen for something that has since been deleted
- **THEN** the screen reports that it is gone

### Requirement: A screen with no trail behind it offers a way up

When a reader arrives directly on a screen, for example by a shared link, a notification, or opening
the installed app cold, the header's back control SHALL take them to that screen's parent in the
guidebook rather than doing nothing or leaving the app.

The platform's own back will leave the app in this situation, and the app SHALL NOT attempt to
prevent that. This is the one permitted divergence from the first requirement, because entries
before the app's own cannot be altered.

#### Scenario: Opening a shared route link

- **WHEN** a reader opens a link to a route in a fresh tab or a cold app
- **THEN** the header's back control takes them to the block the route belongs to

### Requirement: Leaving unsaved work asks first

Where leaving a screen would discard work the reader has entered, the app SHALL ask before
discarding it, and SHALL ask on every way out, including the platform's back gesture and button, not
only the app's own controls.

#### Scenario: Abandoning a partly filled multi-step form

- **WHEN** a reader has entered data into a multi-step form and triggers any back affordance that
  would leave the form
- **THEN** they are asked to confirm before the work is discarded

### Requirement: Reloading mid-task degrades predictably

If the page is reloaded or restored by the browser while a reader is part-way through a task, the
app MAY lose what it knew about the trail behind that screen. In that case, completing the task
SHALL still show the correct destination, and MAY cost one additional back press before the reader
reaches what was behind the task.

The app SHALL NOT respond to a lost trail by leaving the completed task reachable.

#### Scenario: Saving after a reload

- **WHEN** a reader reloads while on a task screen and then completes the task
- **THEN** the destination is shown, and going back does not return them to the completed task
