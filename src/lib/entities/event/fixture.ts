import type { EventListItem } from './mapper'

/**
 * The event fixtures tests and stories build on.
 *
 * One builder rather than one per file. The row shape used to be copied into three test files and
 * a story module, so a field added to it had to be remembered four times and a drifted default
 * made two files disagree about what a plain row is.
 *
 * Not imported by the app.
 */
export function event(partial: Partial<EventListItem>): EventListItem {
  return {
    actorFk: 1,
    actorName: 'ada',
    changes: [],
    comments: [],
    createdAt: 0,
    entity: undefined,
    id: 1,
    metadata: undefined,
    objectId: 1,
    objectType: 'route',
    parent: undefined,
    parentEntity: undefined,
    reactions: [],
    regionFk: 1,
    verb: 'update',
    ...partial,
  }
}

/**
 * A synced row as `toEvent` receives it, so `entityOf`'s six branches are unit-testable.
 *
 * Without this the mapper could only be exercised against a live database, and only through
 * whatever rows that database happened to hold: the block, user, invite and file branches had no
 * coverage at all, which is how two naming bugs reached review.
 *
 * Loosely typed on purpose. `EventRow` is a deep Zero query type with every relation on it, and
 * spelling out a whole route tree per case would make each test unreadable for no extra safety:
 * what these assert is which branch runs and what it names.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
export function eventRow(partial: Record<string, unknown>): any {
  return {
    actor: { id: 1, username: 'ada' },
    actorFk: 1,
    area: undefined,
    ascent: undefined,
    block: undefined,
    changes: [],
    createdAt: 0,
    file: undefined,
    id: 1,
    metadata: null,
    regionFk: 1,
    route: undefined,
    subject: undefined,
    verb: 'update',
    ...partial,
  }
}
