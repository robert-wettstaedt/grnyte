/**
 * Every card an action on a REGION MEMBERSHIP can produce.
 *
 * The awkward domain, and the reason `line.ts` reads the object and the metadata rather than the
 * verb alone: six different actions write about a `user`, and three of them share a verb. An
 * invitation and a revoked invitation both point `subject_fk` at the INVITER, degenerately, and
 * carry the address in `metadata`; a member removal writes the same `remove` verb with the removed
 * person as its subject and no metadata at all. Read the pair together, never the verb on its own.
 *
 * Same contract as `area.ts`: each case names the write site it stands for, states the events that
 * site emits, and claims what the card says. The claim is derived by reading the code, so it is
 * what is under review, never the oracle.
 */
import type { EventCase } from './types'
import { change, eventAgo, ME, userEntity } from './world'

/**
 * The address every invitation case uses, so two cards never read as two different people.
 *
 * It is the whole subject of those cards: the invitee has no `users` row to point at, so the
 * catalogue entry declares `names: 'stored'` and the headline renders this string.
 */
const INVITEE = 'lea.hofer@example.com'

/**
 * What the mapper builds for an invitation: the address as the name, and no row of its own.
 *
 * Written out rather than taken from `userEntity`, because the world holds people and this is not
 * one. Nothing renders it either way (`names: 'stored'` keeps the subject out of the card's refs),
 * so it is here to state what the event really resolves to rather than to feed a row.
 */
const invitation = { crumbs: [], name: INVITEE, row: 'none' as const }

/**
 * A member the region no longer holds, as the mapper resolves one.
 *
 * The name survives, the link does not: `mapper.ts` drops the `href` for a `remove` or a `leave`,
 * because a profile the reader's member list no longer holds is a dead end. The catalogue says the
 * same thing from the other side with `row: 'none'`, so no row is drawn at all.
 */
const departed = (userFk: number) => ({ ...userEntity(userFk), href: undefined, row: 'none' as const })

export const REGION_CASES: EventCase[] = [
  {
    action: '/settings -> Regions -> {Region} -> Invite someone -> email address -> Invite',
    domain: 'region',
    events: [
      eventAgo(240, {
        actorFk: ME,
        entity: invitation,
        metadata: INVITEE,
        // The INVITER, not the invitee: there is no account to point at yet.
        objectId: ME,
        objectType: 'user',
        verb: 'invite',
      }),
    ],
    expected:
      'Single card, "You invited lea.hofer@example.com". The address is read off the row rather than off an entity, so no profile row is drawn and there is no change line: the headline already is the address.',
    id: 'REGION-01a',
    writer: 'regions.remote.ts:274',
  },
  {
    action: 'The same invite, with Resend failing to accept the mail',
    domain: 'region',
    events: [],
    expected:
      'No card. The event is written only inside `if (sent)`, so a failed send leaves a live invitation and a silent log rather than announcing a mail nobody received.',
    id: 'REGION-01b',
    writer: 'regions.remote.ts:270',
  },
  {
    action: 'Invite the same address again within 15 minutes (a second Invite on a live invitation)',
    domain: 'region',
    events: [
      eventAgo(235, {
        actorFk: ME,
        entity: invitation,
        metadata: INVITEE,
        objectId: ME,
        objectType: 'user',
        verb: 'invite',
      }),
    ],
    expected:
      'Still one card, not two. The fold key is the actor, the region, the object and the metadata, and `invite` joins its own kind, so the open event is re-dated to now and keeps its id. Two cards here would mean the repeat collapse is not working.',
    id: 'REGION-01c',
    writer: 'regions.remote.ts:274',
  },
  {
    action: 'Invite two different addresses minutes apart',
    domain: 'region',
    events: [
      eventAgo(230, {
        actorFk: ME,
        entity: { crumbs: [], name: 'noa.frei@example.com', row: 'none' },
        metadata: 'noa.frei@example.com',
        objectId: ME,
        objectType: 'user',
        verb: 'invite',
      }),
      eventAgo(232, {
        actorFk: ME,
        entity: invitation,
        metadata: INVITEE,
        objectId: ME,
        objectType: 'user',
        verb: 'invite',
      }),
    ],
    expected:
      'Two cards, minutes apart and never one. Both events name the same subject (the inviter), so only the metadata keeps them apart, and the group key carries it for exactly this reason: one card could headline one address only.',
    id: 'REGION-01d',
    writer: 'regions.remote.ts:274',
  },
  {
    action: 'The first send failed, so somebody else presses Resend on the pending invitation row',
    domain: 'region',
    events: [
      eventAgo(225, {
        actorFk: 3,
        entity: invitation,
        metadata: INVITEE,
        // Whoever pressed Resend, since that is the moment the invitation reached anybody.
        objectId: 3,
        objectType: 'user',
        verb: 'invite',
      }),
    ],
    expected:
      'Single card, "Sofia Brandt invited lea.hofer@example.com", logged in the name of the person who pressed Resend rather than the original inviter. Same sentence as REGION-01a, and no change line.',
    id: 'REGION-01e',
    writer: 'invite.server.ts:461',
  },
  {
    action: 'Resend an invitation the region has already logged',
    domain: 'region',
    events: [],
    expected:
      "No card, and nothing moves. A resend is not a new invitation, so the write is skipped rather than left to the fold: joining the open event would re-date somebody else's card to now and float it back to the top, and past the window it would log a second invitation instead.",
    id: 'REGION-01f',
    writer: 'invite.server.ts:460',
  },

  {
    action: '/settings/regions/{id} -> the pending invitation row -> Revoke invitation',
    domain: 'region',
    events: [
      eventAgo(205, {
        actorFk: ME,
        entity: invitation,
        metadata: INVITEE,
        objectId: ME,
        objectType: 'user',
        verb: 'remove',
      }),
    ],
    expected:
      'Single card, "You revoked the invite for lea.hofer@example.com". A `remove` hands its metadata to `oldValue`, and the stored-name rule reads `newValue ?? oldValue`, so the address still lands in the headline. No row and no change line.',
    id: 'REGION-02a',
    writer: 'regions.remote.ts:313',
  },
  {
    action: 'Invite an address, then revoke it a few minutes later',
    domain: 'region',
    events: [
      eventAgo(200, {
        actorFk: ME,
        entity: invitation,
        metadata: INVITEE,
        objectId: ME,
        objectType: 'user',
        verb: 'remove',
      }),
      eventAgo(204, {
        actorFk: ME,
        entity: invitation,
        metadata: INVITEE,
        objectId: ME,
        objectType: 'user',
        verb: 'invite',
      }),
    ],
    expected:
      'TWO cards, "You revoked the invite for lea.hofer@example.com" over "You invited lea.hofer@example.com". Two events on the server (a `remove` does not join an open `invite`), and the client keeps them apart because the group key carries the verb: without that they shared the key (same subject, same address) and neither sentence survived, so the card read "You edited lea.hofer@example.com, 2 edits", asserting an edit to an email address.',
    id: 'REGION-02b',
    writer: 'regions.remote.ts:313',
  },
  {
    action: 'Sofia invites the address, then Mara revokes it from the same screen',
    domain: 'region',
    events: [
      eventAgo(195, {
        actorFk: 5,
        entity: invitation,
        metadata: INVITEE,
        objectId: 5,
        objectType: 'user',
        verb: 'remove',
      }),
      eventAgo(197, {
        actorFk: 3,
        entity: invitation,
        metadata: INVITEE,
        objectId: 3,
        objectType: 'user',
        verb: 'invite',
      }),
    ],
    expected:
      'Two cards, "Mara Lindqvist revoked the invite for lea.hofer@example.com" over "Sofia Brandt invited lea.hofer@example.com". Two reasons here rather than one: the subject is the ACTOR on both, so the keys differ by actor, and the verb is in the key as well. REGION-02b is the same pair by one person, and stays two cards on the verb alone.',
    id: 'REGION-02c',
    writer: 'regions.remote.ts:313',
  },
  {
    action: 'Revoke an invitation, then Undo from the toast',
    domain: 'region',
    events: [],
    expected:
      'No card, and the revoke card disappears. The filter is the address, the region and the verb but not the actor, so any admin undoing it erases the record; the invitation card survives, carrying a different verb.',
    id: 'REGION-02d',
    writer: 'regions.remote.ts:335',
  },

  {
    action: 'Follow the emailed link to /invite/accept?token={uuid} -> Join {Region}',
    domain: 'region',
    events: [eventAgo(180, { actorFk: 5, objectId: 5, objectType: 'user', verb: 'accept' })],
    expected:
      'Single card, "Mara Lindqvist joined". No change line, and no profile row either: the sentence lives on the invitation entry, which declares `names: stored`, so the joiner is kept out of the card refs even though the event resolves her perfectly well. Worth deciding, since this is the one membership card whose subject is still there to link to.',
    id: 'REGION-03a',
    writer: 'invite.server.ts:188',
  },
  {
    action: 'Reopen the accept link, or double tap Join, while already an active member',
    domain: 'region',
    events: [],
    expected:
      'No card. The membership insert and the event share the `existing == null` branch, so a reopened link marks the invitation used and writes nothing.',
    id: 'REGION-03b',
    writer: 'invite.server.ts:162',
  },

  {
    action: "/settings/regions/{id} -> another member's row -> Role -> pick a different role",
    domain: 'region',
    events: [
      eventAgo(160, {
        actorFk: ME,
        changes: [change({ columnName: 'role', newValue: 'region_maintainer', oldValue: 'region_user' })],
        objectId: 5,
        objectType: 'user',
      }),
    ],
    expected:
      'Single card, "You changed the role of Mara Lindqvist", with one change line labelled Role reading User to Maintainer. The stored values are the enum members, and the role formatter is what makes the chips read like the member list. The subject is somebody else and is still in the region, so her profile row is drawn under it.',
    id: 'REGION-04a',
    writer: 'regions.remote.ts:414',
  },
  {
    action: 'Change the same member from User to Maintainer, then to Admin, inside the 15-minute window',
    domain: 'region',
    events: [
      eventAgo(155, {
        actorFk: ME,
        // The fold overwrites `new_value` on the open event's change row rather than adding a
        // second, so the card says where the role ended up, not the path it took.
        changes: [change({ columnName: 'role', newValue: 'region_admin', oldValue: 'region_user' })],
        objectId: 5,
        objectType: 'user',
      }),
    ],
    expected:
      'Still one card with one line, User to Admin. The intermediate Maintainer is erased, which is the point: it was never a role she was left holding.',
    id: 'REGION-04b',
    writer: 'regions.remote.ts:414',
  },
  {
    action: 'Change a role, then change it back inside the window',
    domain: 'region',
    events: [],
    expected:
      'No card at all. The change row that returned to its old value is deleted, and an update left with no changes deletes itself.',
    id: 'REGION-04c',
    writer: 'regions.remote.ts:414',
  },
  {
    action: "Change the same person's role in one region, then in a second region, inside the window",
    domain: 'region',
    events: [
      eventAgo(150, {
        actorFk: ME,
        changes: [change({ columnName: 'role', newValue: 'region_admin', oldValue: 'region_user' })],
        objectId: 5,
        objectType: 'user',
        regionFk: 2,
      }),
      eventAgo(152, {
        actorFk: ME,
        changes: [change({ columnName: 'role', newValue: 'region_maintainer', oldValue: 'region_user' })],
        objectId: 5,
        objectType: 'user',
      }),
    ],
    expected:
      'Two cards, one per region. Both the write fold and the group key carry the region, which they have to: a person holds a different role in each, and one card could report only one of them. Nothing on either card says WHICH region, so they read alike apart from the roles.',
    id: 'REGION-04d',
    writer: 'regions.remote.ts:414',
  },

  {
    action: "/settings/regions/{id} -> a member's row -> below the rule -> Remove",
    domain: 'region',
    events: [eventAgo(140, { actorFk: ME, entity: departed(5), objectId: 5, objectType: 'user', verb: 'remove' })],
    expected:
      'Single card, "You removed Mara Lindqvist from the region". The headline names her off the resolved subject, and no profile row is drawn: she is out of the region, so the link would be a dead end. No change line either, deliberately, since the removal stores no old and new pair.',
    id: 'REGION-05a',
    writer: 'regions.remote.ts:466',
  },
  {
    action: 'Remove one member, then remove a second one minutes later',
    domain: 'region',
    events: [
      eventAgo(134, { actorFk: ME, entity: departed(3), objectId: 3, objectType: 'user', verb: 'remove' }),
      eventAgo(137, { actorFk: ME, entity: departed(5), objectId: 5, objectType: 'user', verb: 'remove' }),
    ],
    expected:
      'Two cards, never one "deleted entries" card. A membership ends with `remove`, not `delete`, so neither event is grouped as a removal, and the key is per person: the reader is told each name rather than a count.',
    id: 'REGION-05b',
    writer: 'regions.remote.ts:466',
  },
  {
    action: 'Remove a member, then Undo from the toast',
    domain: 'region',
    events: [],
    expected:
      'No card, and the removal card goes with it. The filter demands `metadata: null`, which is what keeps it off a revoked invitation on the same subject, and it is scoped to the region, so a removal from a second region survives.',
    id: 'REGION-05c',
    writer: 'regions.remote.ts:515',
  },

  {
    action: '/settings/regions/{id} -> your own member row -> Leave region -> confirm',
    domain: 'region',
    events: [eventAgo(120, { actorFk: 5, entity: departed(5), objectId: 5, objectType: 'user', verb: 'leave' })],
    expected:
      'Single card, "Mara Lindqvist left the region". The sentence names only the actor, who is also the subject, so there is no name slot to fill, no row and no change line. Leaving has its own verb precisely so this does not read as "Mara removed Mara".',
    id: 'REGION-06a',
    writer: 'regions.remote.ts:541',
  },
  {
    action: "Leave a region you are the sole remaining admin of (the row is not rendered, so this is the API's answer)",
    domain: 'region',
    events: [],
    expected:
      'No card. The last-admin check runs before the event, and both statements share the transaction, so nothing is logged for an attempt that cannot succeed.',
    id: 'REGION-06b',
    writer: 'regions.remote.ts:532',
  },
  {
    action: 'Leave a region, get invited back, and accept within half an hour',
    domain: 'region',
    events: [
      eventAgo(110, { actorFk: 5, objectId: 5, objectType: 'user', verb: 'accept' }),
      eventAgo(125, { actorFk: 5, entity: departed(5), objectId: 5, objectType: 'user', verb: 'leave' }),
    ],
    expected:
      'Two cards, "Mara Lindqvist joined" over "Mara Lindqvist left the region", each with its own sentence. Neither event carries metadata, so the verb is the only thing keeping them apart: without it in the group key they merged and the card read "Mara Lindqvist edited Mara Lindqvist, 2 edits", naming neither the departure nor the return.',
    id: 'REGION-06c',
    writer: 'regions.remote.ts:541',
  },

  {
    action: '/settings -> Account -> Username -> type a new name -> Save, as a member of one region',
    domain: 'region',
    events: [
      eventAgo(100, {
        actorFk: 5,
        changes: [change({ columnName: 'username', newValue: 'Mara Lindqvist', oldValue: 'mara.l' })],
        objectId: 5,
        objectType: 'user',
      }),
    ],
    expected:
      'Single card, "Mara Lindqvist changed their name", with one change line labelled Username reading mara.l to Mara Lindqvist. The headline has no name slot, and the actor name is always the CURRENT one, so a reader who only knew the old name has to read the change line to connect the two.',
    id: 'REGION-07a',
    writer: 'users.remote.ts:58',
  },
  {
    action: 'The same rename by somebody who belongs to three regions',
    domain: 'region',
    events: [
      eventAgo(95, {
        actorFk: 5,
        changes: [change({ columnName: 'username', newValue: 'Mara Lindqvist', oldValue: 'mara.l' })],
        objectId: 5,
        objectType: 'user',
      }),
      eventAgo(95, {
        actorFk: 5,
        changes: [change({ columnName: 'username', newValue: 'Mara Lindqvist', oldValue: 'mara.l' })],
        objectId: 5,
        objectType: 'user',
        regionFk: 2,
      }),
      eventAgo(95, {
        actorFk: 5,
        changes: [change({ columnName: 'username', newValue: 'Mara Lindqvist', oldValue: 'mara.l' })],
        objectId: 5,
        objectType: 'user',
        regionFk: 18,
      }),
    ],
    expected:
      'Three identical cards, one per region, because the feed is region-scoped and a rename is news in each. A reader who shares two of those regions sees the same sentence twice, since nothing on a card says which region it belongs to. Worth deciding: this is the case that argues for a region label.',
    id: 'REGION-07b',
    writer: 'users.remote.ts:57',
  },
  {
    action: 'Rename yourself while belonging to no region at all',
    domain: 'region',
    events: [],
    expected:
      'No card anywhere. The loop has nothing to run over, so the users row is renamed and the feed says nothing, which is correct: there is nobody the name was news to.',
    id: 'REGION-07c',
    writer: 'users.remote.ts:57',
  },
  {
    action: 'Rename twice inside the 15-minute window, mara to mara.l to Mara Lindqvist',
    domain: 'region',
    events: [
      eventAgo(90, {
        actorFk: 5,
        changes: [change({ columnName: 'username', newValue: 'Mara Lindqvist', oldValue: 'mara' })],
        objectId: 5,
        objectType: 'user',
      }),
    ],
    expected:
      'One card with one line, mara to Mara Lindqvist. The same per-column fold the role change gets, and renaming back to the starting name inside the window would leave no card at all.',
    id: 'REGION-07d',
    writer: 'users.remote.ts:58',
  },
  {
    action: 'An admin changes your role, and you rename yourself within half an hour',
    domain: 'region',
    events: [
      eventAgo(85, {
        actorFk: 5,
        changes: [change({ columnName: 'username', newValue: 'Mara Lindqvist', oldValue: 'mara.l' })],
        objectId: 5,
        objectType: 'user',
      }),
      eventAgo(88, {
        actorFk: ME,
        changes: [change({ columnName: 'role', newValue: 'region_maintainer', oldValue: 'region_user' })],
        objectId: 5,
        objectType: 'user',
      }),
    ],
    expected:
      'One card mixing two actors, which only an entity group allows: "Mara Lindqvist and others edited Mara Lindqvist", a "2 edits, 2 people" sub line, her profile row once, and both change lines (Username, then Role). Two people did two unrelated things to one person, and the card can only say that somebody edited her.',
    id: 'REGION-07e',
    writer: 'users.remote.ts:58',
  },

  {
    action: '/blocks/400/routes/add -> First ascensionists -> Me -> Save, the first ever claim in that region',
    domain: 'region',
    events: [
      eventAgo(80, {
        actorFk: 5,
        // The climbing name the route was submitted with, which is not required to match the
        // account's username.
        metadata: 'M. Lindqvist',
        objectId: 5,
        objectType: 'user',
        verb: 'add',
      }),
    ],
    expected:
      'Single card, "Mara Lindqvist linked themselves to the first ascensionist Mara Lindqvist", with her profile row and one change line labelled First ascensionist reading Not set to M. Lindqvist. One thing left to look at: the headline names the ACCOUNT twice and never the claimed climbing name, because the entry reads a hydrated subject where the line reads the stored value. The line itself is right, and was not: it rendered the not-set placeholder on both sides until the stored name was handed to the value the renderer reads.',
    id: 'REGION-08a',
    writer: 'firstAscensionist.server.ts:65',
  },
  {
    action: 'A first ascensionist claimed BEFORE the events cutover, as the backfill migrated it',
    domain: 'region',
    events: [
      eventAgo(78, {
        actorFk: 5,
        changes: [change({ columnName: 'first ascensionist', newValue: 'M. Lindqvist' })],
        objectId: 5,
        objectType: 'user',
      }),
    ],
    expected:
      'The same card as REGION-08a from the shape migrated history carries: an `update` with a change row rather than an `add` with the name in metadata. Found in the running app, where every claim made before the cutover read "You made a change to admin" and showed no change line at all. The catalogue holds both shapes now.',
    id: 'REGION-08b',
    writer: null,
  },
  {
    action: 'Claim yourself as first ascensionist again, on another route in the same region',
    domain: 'region',
    events: [],
    expected:
      'No card. The submitted climber matches the row that now exists, so no row is created and nothing is logged: a claim binds an account to a climbing identity once ever, per region.',
    id: 'REGION-08c',
    writer: 'firstAscensionist.server.ts:48',
  },
  {
    action: "Submit a first ascensionist with somebody else's userFk forged into the payload",
    domain: 'region',
    events: [],
    expected:
      'No card. The claim is dropped to null unless it is the caller\'s own, so the climber row is created unlinked and there is no account to have "linked themselves" to anything.',
    id: 'REGION-08d',
    writer: 'firstAscensionist.server.ts:43',
  },

  {
    action: 'A membership that predates the migration, carried over as the `join` verb',
    domain: 'region',
    events: [eventAgo(60, { actorFk: 5, objectId: 5, objectType: 'user', verb: 'join' })],
    expected:
      'The honest degraded state, and the only verb with no writer: nothing in the app emits `join`, and the catalogue has no entry for what it resolves to, nor a vaguer verb for that entity. It falls all the way through to the generic sentence, "Mara Lindqvist made a change to Mara Lindqvist", with her profile row under it and no change line. The rename step is what owes it a sentence.',
    id: 'REGION-09a',
    writer: null,
  },

  {
    action: 'A member removal whose subject the reader cannot resolve',
    domain: 'region',
    events: [
      eventAgo(55, {
        actorFk: ME,
        entity: undefined,
        objectId: 999,
        objectType: 'user',
        verb: 'remove',
      }),
    ],
    expected:
      'The honest degraded state: the card keeps the sentence and loses the name, "You removed ... from the region" with the unnamed placeholder in the slot. A removal stores no name of its own, because metadata is exactly what tells it apart from a revoked invitation and so has to stay null. Reachable when a departed member falls outside what the reader may sync.',
    id: 'REGION-10a',
    writer: 'regions.remote.ts:466',
  },
]
