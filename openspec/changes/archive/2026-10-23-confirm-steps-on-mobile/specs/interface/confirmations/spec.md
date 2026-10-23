# Spec Delta

## Purpose

Decides how a confirm step lays out its actions on each screen size, so the action a person is about to take is the easiest to hit and a destructive one is unmistakable.

## ADDED Requirements

### Requirement: Confirm actions stack on mobile

On a mobile-width screen, a confirm step SHALL show its actions as full-width buttons stacked vertically, the main action on top, any second action under it, and Cancel at the bottom. It SHALL stay a centred card.

#### Scenario: Deleting an ascent on a phone

- **WHEN** a climber taps Delete on their ascent at 375 pixels wide
- **THEN** a centred card asks for confirmation with a full-width Delete button above a full-width Cancel button

### Requirement: Confirm actions sit at the bottom right on desktop

On a desktop-width screen, a confirm step SHALL show Cancel, then any second action, then the main action, in a row at the bottom right of the card.

#### Scenario: Leaving a region on desktop

- **WHEN** a member chooses to leave a region at 1280 pixels wide
- **THEN** the card shows Cancel and Leave region side by side at its bottom right

### Requirement: A destructive action is red

A confirm step whose main action deletes, removes or leaves SHALL render that action in the destructive colour.

#### Scenario: Removing a tag

- **WHEN** an admin confirms removing a tag
- **THEN** the Remove button is red and Cancel is not

### Requirement: Dismissing a confirm step does nothing

Cancel, the close button, Escape and a tap outside the card SHALL close a confirm step without taking any action.

#### Scenario: Tapping outside

- **WHEN** a person taps outside the card
- **THEN** it closes and nothing is deleted
