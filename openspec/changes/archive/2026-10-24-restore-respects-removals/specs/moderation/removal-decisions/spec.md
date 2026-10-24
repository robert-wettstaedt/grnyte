## ADDED Requirements

### Requirement: Removed content comes back only through Undo

An area, block or route removed for breaking the rules SHALL come back only by undoing its decision. While the decision stands, any other restore of it by someone otherwise allowed to restore it SHALL be refused with the message that only a region admin can bring it back from the region's moderation log, and the decision SHALL stay standing. Anyone else SHALL get the same refusal as for any restore they may not make, so a refusal never reveals what was moderated.

#### Scenario: The author restores their own removed sector

- **WHEN** a maintainer whose sector a region admin removed for breaking the rules sends a restore of it
- **THEN** it is refused, the sector stays removed, and the decision still reads in effect

#### Scenario: An admin restores instead of undoing

- **WHEN** a region admin sends a restore of a route another admin removed for breaking the rules
- **THEN** it is refused, and the route comes back only once the decision is undone

#### Scenario: Someone outside the region tries

- **WHEN** an admin of another region sends a restore of a route removed for breaking the rules
- **THEN** they get the ordinary permission refusal, which does not say it was removed

#### Scenario: Undo still restores

- **WHEN** an admin of the region undoes the removal of a block
- **THEN** the block is back and the decision reads reversed

#### Scenario: Tidying up is unaffected

- **WHEN** an admin deletes a route as tidying up and restores it
- **THEN** the route is back
