## MODIFIED Requirements

### Requirement: One open report per member and object

A member SHALL have at most one open report on an object; sending again SHALL update its ground and note. While it is open, the object's entry SHALL read Reported and reopening it SHALL show what was sent. There SHALL be no withdrawing a report. Once a report closes, the object's entry SHALL stop reading Reported without a reload, in a Zero build and in a PowerSync build alike.

#### Scenario: Reporting twice

- **WHEN** a member who reported a photo as spam reports it again as harassment with a note
- **THEN** their one open report on it now reads harassment with that note

#### Scenario: A report closes while its object is on screen

- **WHEN** a member has a comment they reported on screen in a PowerSync build, and an admin dismisses the report
- **THEN** the comment's entry stops reading Reported within a few seconds, without a reload and with no request to the app server for the member's reports
