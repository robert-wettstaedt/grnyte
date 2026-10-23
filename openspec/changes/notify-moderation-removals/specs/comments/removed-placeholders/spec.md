# Spec Delta

## Purpose

Keeps a comment thread readable when one of its comments goes: the replies other people wrote stay, under a placeholder that says how the comment they answer was removed.

## ADDED Requirements

### Requirement: A removed comment with replies leaves a placeholder

When a comment that has replies is removed by a region admin or deleted by its author, it SHALL be replaced for every member by a placeholder, and its replies SHALL stay. The placeholder SHALL read "Removed by a region admin" or "Deleted by its author", SHALL keep the comment's time, and SHALL NOT show its author's name or avatar.

#### Scenario: Admin removes a thread root

- **WHEN** a region admin removes a comment that has replies
- **THEN** every member sees "Removed by a region admin" in its place with the replies under it

#### Scenario: Author deletes their own thread root

- **WHEN** an author deletes their own comment that has replies by others
- **THEN** every member sees "Deleted by its author" in its place, and the replies stay

### Requirement: A removed comment without replies leaves nothing

A comment with no replies SHALL disappear for other members when removed or deleted. The person who removed it SHALL keep the inline Undo row until they leave the screen.

#### Scenario: Removing a reply

- **WHEN** an admin removes a reply
- **THEN** other members no longer see it, and the admin sees the Undo row in its place

### Requirement: A placeholder whose last reply goes disappears

A placeholder SHALL disappear once no reply under it remains.

#### Scenario: Last reply deleted

- **WHEN** the only reply under a placeholder is deleted by its author
- **THEN** the placeholder and the reply are both gone
