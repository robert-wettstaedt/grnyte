# Spec Delta

## Purpose

Decides what happens when someone removes another member's content in a region: whether it is upkeep or a rule-breaking removal, who is told and with what reason, how it is undone, and how long the decision is kept.

## ADDED Requirements

### Requirement: A region admin can remove another member's comment

A region admin SHALL be able to remove a comment written by another member of their region. Other members, maintainers included, SHALL NOT. Emoji reactions SHALL NOT be removable by anyone but their author.

#### Scenario: Admin removes a comment

- **WHEN** a region admin removes another member's comment, giving a ground and a reason
- **THEN** the comment is removed for every member

#### Scenario: Maintainer cannot

- **WHEN** a maintainer looks at another member's comment
- **THEN** no remove action is offered and a removal request is refused

#### Scenario: The owner's comment

- **WHEN** a region admin removes a comment written by the region's owner
- **THEN** the comment is removed and the owner is notified like any other member

#### Scenario: A deleted author's comment

- **WHEN** a region admin removes a comment whose author deleted their account
- **THEN** the comment is removed and nobody is notified

### Requirement: Removing someone else's content is either tidying up or a rule-breaking removal

When a region admin deletes an area, block, route, topo, ascent, media file or comment created by another member, they SHALL choose tidying up or breaks the rules. A comment SHALL always be a rule-breaking removal. Deleting one's own content SHALL offer no choice.

#### Scenario: Tidying up

- **WHEN** an admin deletes another member's duplicate route as tidying up
- **THEN** the route is deleted, no moderation decision is recorded and nobody is notified

#### Scenario: Own leaf content

- **WHEN** an admin deletes their own ascent, media file or comment
- **THEN** no choice is offered and nobody is notified

#### Scenario: Own container

- **WHEN** an admin deletes an area, block, route or topo they created themselves
- **THEN** the choice is offered, because it may hold other members' content

#### Scenario: Choosing breaks the rules

- **WHEN** an admin chooses breaks the rules for another member's route
- **THEN** a removal form opens showing the route's content, the grounds, a reason field and who will be told, and nothing is deleted until it is submitted

#### Scenario: Nothing of anyone else's

- **WHEN** an admin chooses breaks the rules for content holding nothing created by another member
- **THEN** the removal is refused and nothing is deleted

#### Scenario: Tidying up someone's ascent

- **WHEN** an admin deletes another member's ascent as tidying up
- **THEN** the climber gets the existing notice that their ascent was deleted, and no moderation decision is recorded

### Requirement: The admin sees who will be told

Before confirming a rule-breaking removal, the admin SHALL see which members will be told, and SHALL NOT be able to confirm until that list has loaded.

#### Scenario: An area with others' routes

- **WHEN** an admin picks breaks the rules for an area holding routes by Ada and two others
- **THEN** the confirmation names Ada and says two others will be told

### Requirement: A rule-breaking removal states its ground and reason

A rule-breaking removal SHALL require a ground from this list and a written reason: unlawful content; harassment or threats; someone's personal data or a photo without consent; impersonation or a false ascent claim; spam or advertising; another breach of the terms.

#### Scenario: Missing reason

- **WHEN** an admin chooses breaks the rules and submits without a reason
- **THEN** the removal is refused with an error on the reason field and nothing is deleted

### Requirement: Maintainers may only tidy up

A maintainer deleting another member's topo, as clause 15 allows, SHALL only be able to tidy up, and SHALL be offered no choice.

#### Scenario: Maintainer deletes a topo

- **WHEN** a maintainer deletes a topo another member drew
- **THEN** it is deleted as tidying up after the same confirmation as today, with no option to mark it as breaking the rules

### Requirement: Every affected author is told

A rule-breaking removal SHALL send each distinct author whose content it removed, including content removed with it, one in-app notice naming what of theirs was removed, the region, that a region admin removed it, the ground, the reason and how to appeal under terms clause 13. The notice SHALL reach the inbox regardless of notification settings, and of whether the author is still a member of the region; push SHALL follow the settings. A deleted account SHALL receive nothing.

#### Scenario: An area with two authors' routes

- **WHEN** an admin removes an area as breaking the rules, and it holds routes by two other members
- **THEN** each of them gets one notice naming their removed content

#### Scenario: Several items of one author

- **WHEN** a removal takes three of Ada's routes and two of her photos
- **THEN** Ada gets one notice summing up what of hers was removed

#### Scenario: Two removals of one author's content

- **WHEN** an admin removes two of one member's comments in the same region, one after the other
- **THEN** that member gets two notices, one per removal

#### Scenario: Notifications switched off

- **WHEN** an affected author has switched notifications off
- **THEN** the notice still appears in their inbox, and no push is sent

### Requirement: The notice opens a statement only its recipient can read

A removal notice SHALL name the removed item (for a comment, the start of its text) and SHALL NOT name the admin. Opening it SHALL show each removed item, the region, the ground, the reason and a way to write in that carries the decision's reference. Only a member whose content the decision removed, and app admins, SHALL be able to open that statement; anyone else, region admins included, SHALL get not found.

#### Scenario: Opening the notice

- **WHEN** Ada opens her removal notice
- **THEN** she sees what of hers was removed, the region, the ground, the reason and a "Write to us" link whose subject carries the decision reference

#### Scenario: Another admin opens the link

- **WHEN** another region admin opens the statement's address
- **THEN** they get not found

### Requirement: Undo reverses the decision

Undoing a rule-breaking removal SHALL restore the content, mark the decision reversed and withdraw each unread notice. An author who already read the notice SHALL receive a short notice that the content was restored. The admin who made the decision SHALL be offered the Undo after removing an area, block, route, ascent or comment; a photo, video or topo removal SHALL offer none, since nothing could come back.

#### Scenario: Undo before it is read

- **WHEN** an admin undoes a comment removal before its author opened the notice
- **THEN** the comment is back and the notice is gone

#### Scenario: Undo after it is read

- **WHEN** the author already read the notice and the admin undoes the removal
- **THEN** the comment is back and the author gets a notice that it was restored

### Requirement: Decisions are recorded and visible to app admins

Every rule-breaking removal SHALL record a decision: what was removed, in which region, by which admin, the ground and reason, when, and whether it was reversed. App admins SHALL see every decision on a screen under settings and SHALL be able to reverse one there.

#### Scenario: Reversing on appeal

- **WHEN** an app admin reverses a decision after an appeal
- **THEN** the content is restored where restoring is possible, the decision reads reversed, and the author is told

### Requirement: Decisions are kept three years

A decision SHALL be deleted three years after it was made. When the author or the admin deletes their account, the decision SHALL stay with that person's link removed.

#### Scenario: Old decision

- **WHEN** a decision is older than three years
- **THEN** the cleanup task deletes it

#### Scenario: Author deletes their account

- **WHEN** the author of removed content deletes their account
- **THEN** the decision remains and no longer names them
