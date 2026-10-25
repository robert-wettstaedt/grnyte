## Purpose

Members tell their region's admins about content that breaks the rules, the admins act on it or dismiss it, and the people who reported hear the outcome, without anyone learning who reported and without report contents reaching the operator.

## ADDED Requirements

### Requirement: Members can report other people's content

A member or maintainer of a region SHALL be able to report another person's area, block, route, ascent, comment, photo or video, or topo in that region, from the object's "More" sheet or, for a comment, from a flag in its action row. An admin of the region SHALL be offered Remove instead and never Report. Nobody SHALL be offered either on their own content.

#### Scenario: A member reports a comment

- **WHEN** a member opens the thread under an event and taps the flag on someone else's comment
- **THEN** the report form opens for that comment

#### Scenario: An admin sees Remove

- **WHEN** an admin of the region opens the same comment's actions
- **THEN** they see Remove and no Report

#### Scenario: Own content

- **WHEN** a member opens their own route's "More" sheet
- **THEN** it offers no Report

### Requirement: A report names a ground and may carry a note

A report SHALL name one of the grounds an admin removes content for and MAY carry a note. Choosing unlawful content or someone's personal data SHALL show that a legal claim can also go to the operator, with a link to the reporting page that carries the content's address. The report itself SHALL still go to the region's admins.

#### Scenario: A spam report without a note

- **WHEN** a member picks spam and sends the form without a note
- **THEN** the report is filed and the member is told the region's admins will take a look

#### Scenario: A legal ground

- **WHEN** a member picks someone's personal data
- **THEN** the form shows the link to the reporting page for a legal claim, and sending it still files the report with the region's admins

### Requirement: One open report per member and object

A member SHALL have at most one open report on an object; sending again SHALL update its ground and note. While it is open, the object's entry SHALL read Reported and reopening it SHALL show what was sent. There SHALL be no withdrawing a report.

#### Scenario: Reporting twice

- **WHEN** a member who reported a photo as spam reports it again as harassment with a note
- **THEN** their one open report on it now reads harassment with that note

### Requirement: The region's admins are told about reports

Every admin of the region SHALL get one inbox notice, and a push if they have push on, per reported object while its reports are open, leading to the region's moderation screen.

#### Scenario: Three reports on one route

- **WHEN** three members report the same route
- **THEN** each admin of the region has one notice about it

### Requirement: The region's admins see open reports

The region's moderation screen SHALL show open reports above the decisions log, one row per object with its name, kind, the number of reports, their grounds and when the newest came in, and, opened, each reporter's name, ground and note. An empty queue SHALL say so. The region screen's Moderation row SHALL show the number of objects with open reports.

#### Scenario: Three reports in the queue

- **WHEN** three members have reported the same route
- **THEN** the moderation screen shows one row for it with three reports

#### Scenario: Removing from the queue

- **WHEN** an admin chooses Remove… on a queue row and submits the removal
- **THEN** they are back on the region's moderation screen

#### Scenario: Nothing reported

- **WHEN** an admin opens the moderation screen of a region with no open reports
- **THEN** the reports section says there are none

### Requirement: Admins remove or dismiss

From a reported object's row an admin SHALL be able to open the removal form with the most reported ground already chosen and an empty reason, or to dismiss the reports after confirming that the people who reported are told the content stays.

#### Scenario: Removing from a report

- **WHEN** an admin chooses Remove on a route reported twice as spam
- **THEN** the removal form opens with spam chosen and the reason empty

#### Scenario: Dismissing

- **WHEN** an admin chooses Dismiss and confirms
- **THEN** the route's reports close as dismissed and the row leaves the queue

### Requirement: Reports close and the reporter hears the outcome

A report SHALL close as acted on when its object is removed for breaking the rules or deleted in any other way, by whoever and through whichever parent, and as dismissed when an admin dismisses it. Each person who reported SHALL get an inbox notice saying which. Undoing a removal SHALL NOT bring a closed report back.

#### Scenario: The author deletes it

- **WHEN** the author of a reported comment deletes it themselves
- **THEN** the report closes as acted on and the member who reported it is told

#### Scenario: Undo after acting

- **WHEN** an admin removes a reported block and then undoes the removal
- **THEN** the block is back and no report on it is open

### Requirement: A reporter is never identifiable to the person reported

The person whose content is reported SHALL NOT learn who reported it, nor anything that would point to them. The app SHALL NOT tell them that a report was filed, with one exception: a region's only admin sees the grounds of reports on their own content, and nothing else of them. Otherwise they SHALL hear only of a removal, through its existing notice.

#### Scenario: Reported and dismissed

- **WHEN** a member's route is reported and an admin dismisses the report
- **THEN** the member gets no notice at all

### Requirement: An admin does not judge reports on their own content while another can

While the region has another admin, reports on an admin's own content SHALL NOT appear in that admin's queue or count, and that admin SHALL NOT be able to dismiss them; the other admins handle them in full. When no other admin exists, the author SHALL be told of them like any admin, SHALL see them as one row with the grounds named and no reporter, note, count or time, and SHALL be able to dismiss them.

#### Scenario: Two admins

- **WHEN** a member reports a route its region's admin Ann wrote, and Cy is the region's other admin
- **THEN** Cy sees the report with the reporter's name and note, and Ann neither sees it nor can dismiss it

#### Scenario: The only admin

- **WHEN** a member reports a route written by the region's only admin
- **THEN** that admin is told and sees the row with the rule named and nothing about who reported, and can dismiss it

### Requirement: The operator sees counts, not contents

No report's ground, note, reporter or object SHALL reach the operator. The operator's all-regions screen SHALL show, per region, the number of open reports and how long ago the oldest and the youngest open report came in.

#### Scenario: The operator checks on a region

- **WHEN** the app admin opens the all-regions screen
- **THEN** a region with reports open for weeks shows their count and ages, and nothing about what was reported

### Requirement: Outsiders use the legal channel

On a public file's page, anyone who is not a member of the file's region SHALL be offered a link to the reporting page carrying the file's address, and no in-app report.

#### Scenario: An anonymous visitor

- **WHEN** someone without an account opens a public photo's link
- **THEN** the page offers a Report link to the reporting page with the photo's address filled in

### Requirement: A report is kept only while it is open

A report SHALL be deleted when it closes, once its reporter's notice is out. Deleting an account SHALL delete the reports it filed and the reports on its content.

#### Scenario: A dismissed report

- **WHEN** an admin dismisses a report
- **THEN** the reporter is told it stays, and the report no longer exists
