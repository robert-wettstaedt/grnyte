## MODIFIED Requirements

### Requirement: Undo reverses the decision

Undoing a rule-breaking removal SHALL restore the content, mark the decision reversed, record which admin undid it, and withdraw each unread notice. An author who already read the notice SHALL receive a short notice that the content was restored. Any admin of the region the decision was made in SHALL be able to undo it: from the Undo offered right after removing an area, block, route, ascent or comment, and from the region's moderation log after a confirmation. The Undo right after a photo, video or topo removal SHALL NOT be offered, since nothing could come back; undoing one from the log only reverses the decision. A maintainer, a member or an admin of another region SHALL NOT be able to undo it. The admin who made the decision SHALL NOT be notified when another admin undoes it.

#### Scenario: Undo before it is read

- **WHEN** an admin undoes a comment removal before its author opened the notice
- **THEN** the comment is back and the notice is gone

#### Scenario: Undo after it is read

- **WHEN** the author already read the notice and the admin undoes the removal
- **THEN** the comment is back and the author gets a notice that it was restored

#### Scenario: A co-admin undoes it

- **WHEN** another admin of the same region undoes a standing decision from the region's moderation log
- **THEN** the content is restored where restoring is possible, the decision reads reversed by that admin, and the admin who made it is not told

#### Scenario: Somebody else tries

- **WHEN** a maintainer of the region, or an admin of a different region, tries to undo the decision
- **THEN** it is refused and the decision stays standing

### Requirement: Decisions are recorded and visible to app admins

Every rule-breaking removal SHALL record a decision: what was removed, in which region, by which admin, the ground and reason, when, and whether it was reversed. App admins SHALL see every decision on a screen under settings and SHALL be able to reverse one there. A region's admins SHALL see the decisions made in that region, newest first, on a moderation screen reached from the region, each showing its status, ground, what kind of item it was, which admin acted, when, its reference, the reason, and the items removed, a comment as at most its first 80 characters. Maintainers and members SHALL NOT see that screen, and no member SHALL learn which admin acted.

#### Scenario: Reversing on appeal

- **WHEN** an app admin reverses a decision after an appeal
- **THEN** the content is restored where restoring is possible, the decision reads reversed, and the author is told

#### Scenario: A region admin reads the log

- **WHEN** an admin of a region opens its moderation screen
- **THEN** they see every decision made in that region, including those of the other admins and which admin made each, and none from other regions

#### Scenario: A maintainer looks for it

- **WHEN** a maintainer of the region opens the region or goes to its moderation screen directly
- **THEN** the region shows no moderation row, and the screen shows no decisions
