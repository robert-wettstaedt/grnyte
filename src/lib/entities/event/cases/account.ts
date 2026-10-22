/**
 * Cards whose actor deleted their account.
 *
 * Nothing writes these: `deleteAccountData` keeps the events the person did and nulls their
 * actor, so each case is another domain's event with `actorFk: null`, as a reader finds it later,
 * and none names a writer.
 */
import type { EventCase } from './types'
import { change, eventAgo } from './world'

export const ACCOUNT_CASES: EventCase[] = [
  {
    action: 'A member adds a route, then deletes their account',
    domain: 'account',
    events: [eventAgo(300, { actorFk: null, objectId: 500, verb: 'create' })],
    expected:
      'Single card, "Deleted user added the route Kante direkt", with a grey person icon in place of a face and no link to a profile.',
    id: 'ACCOUNT-01a',
    writer: null,
  },
  {
    action: 'A member renames a route, others comment, then the member deletes their account',
    domain: 'account',
    events: [
      eventAgo(240, {
        actorFk: null,
        changes: [change({ columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' })],
        commentCount: 2,
        objectId: 500,
      }),
    ],
    expected:
      'Single card, "Deleted user renamed Kante direkt", with its change line and the two comments the others left, which stay with the card.',
    id: 'ACCOUNT-01b',
    writer: null,
  },
  {
    action: "A member changes another member's role, then deletes their account",
    domain: 'account',
    events: [
      eventAgo(160, {
        actorFk: null,
        changes: [change({ columnName: 'role', newValue: 'region_maintainer', oldValue: 'region_user' })],
        objectId: 5,
        objectType: 'user',
      }),
    ],
    expected:
      'Single card, "Deleted user changed the role of Mara Lindqvist", with the role line: it is Mara\'s history in the region, so it stays.',
    id: 'ACCOUNT-01c',
    writer: null,
  },
]
