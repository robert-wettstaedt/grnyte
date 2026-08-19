/**
 * Every remote function names a permission gate, or says in writing why it does not.
 *
 * This is the ratchet the twelve fixes were not. Those were each a bug somebody found; this is the
 * check that fails when handler thirteen arrives with no gate at all, which is the failure mode the
 * database used to absorb: while RLS narrowed every statement, a handler that forgot to ask was
 * merely redundant. Once RLS keeps region scoping only, it ships.
 *
 * STATIC on purpose. It reads the source off disk and parses it; it never imports a module, so the
 * SvelteKit runtime is not involved and this runs in the ordinary test project with no database.
 *
 * What it CANNOT do, said plainly so nobody trusts it further than it goes: it checks that a gate is
 * NAMED, not that the gate is right. `updateArea` called `requireEditableArea` throughout the whole
 * period it was letting a rename move an area between regions. A gate reading the stored row while
 * the write uses the submitted one passes here. `no-drizzle-mass-assignment` covers that specific
 * shape; nothing but a test that drives the handler covers the general one.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * The identifiers that count as asking permission.
 *
 * An explicit set rather than a `can*`/`require*` regex: the regex passes on any future helper whose
 * name happens to fit, which makes the check agree with itself rather than with the codebase. Adding
 * a gate here is a deliberate line in a review.
 *
 * Some of these are not predicates but the ENTRY POINTS that reach one, because the gate sits in
 * another module and the one-hop walk below cannot follow an import. Naming them is cheaper than
 * teaching the walk to resolve modules, and each was read to the bottom before being added:
 *
 * - `acceptInvitation` pins the invitation's address to the session email before it writes
 * - `resendInvitation`, `restoreInvitation` and `revokeInvitation` all reach `canEditRegion` through
 *   `loadEditable` in invite.server.ts, which loads the row and checks the STORED `regionFk`
 * - `resolveAttachRegion` returns the region a file may attach to, or refuses
 * - `verifyUpload` proves ownership of the host-side video object
 *
 * Adding a name here that does NOT gate would quietly defeat the whole check, which is why the list
 * is short and why the reason is written down.
 */
const GATES = new Set([
  'acceptInvitation',
  'assertCanEdit',
  'assertIsMember',
  'canAddArea',
  'canAddBlock',
  'canAddParking',
  'canAddRoute',
  'canDeleteArea',
  'canDeleteAscent',
  'canDeleteBlock',
  'canDeleteFile',
  'canDeleteParking',
  'canDeleteRoute',
  'canEditAscent',
  'canEditBlock',
  'canEditFile',
  'canEditRegion',
  'canEditRoute',
  'canEditTopo',
  'canHardDelete',
  'canLogAscent',
  'canReadRegion',
  'checkRegionPermission',
  'requireEditableArea',
  'requireEditableFile',
  'requireRow',
  'requireRowForm',
  'resendInvitation',
  'resolveAttachRegion',
  'restoreInvitation',
  'revokeInvitation',
  'verifyUpload',
])

/** The wrappers that make an export a remote function. */
const WRAPPERS = new Set(['authedCommand', 'authedForm', 'authedQuery', 'command', 'form', 'query'])

/**
 * Handlers that legitimately name no gate, each with the reason.
 *
 * Filling this in IS the audit: a handler arrives here only after somebody has read it and decided.
 * Keyed `file#export` so a rename shows up as one stale entry and one ungated handler rather than
 * silently carrying its exemption to a different function.
 */
const NO_GATE: Record<string, string> = {
  'lib/auth/session.remote.ts#signOut':
    'Acts on whatever session the request already carries and revokes only that one; the sole input is a redirect path, validated same-origin.',
  'lib/entities/event/events.remote.ts#userContributionCount':
    'Counts on the RLS connection, so the region scope is the "region.read can read events" policy rather than anything the handler restates; the only input is the id of the user whose number is on screen.',
  'lib/entities/file/files.remote.ts#createBunnyVideo':
    "Takes no id at all: it mints an empty video object in the caller's own host collection, and the region gate runs at finalizeVideo, which is where an entity to attach to is finally named.",
  'lib/entities/notification/notifications.remote.ts#markEventFeedSeen':
    "Moves the caller's own feed watermark: the settings row is addressed by the session user through the shared writer, and the only client value is the timestamp it is compared against.",
  'lib/entities/notification/notifications.remote.ts#markNotificationsRead':
    'Takes no input at all and updates only unread rows whose user_fk is the session user, so there is no id a caller could aim somewhere else.',
  'lib/entities/notification/notifications.remote.ts#sendTestPush':
    "Looks the subscription up by endpoint AND the session user's id, so an endpoint belonging to somebody else simply reads back as not found.",
  'lib/entities/notification/notifications.remote.ts#subscribeToPush':
    "Registers the caller's own device: every owner column comes from the session, and the endpoint from the payload carries its own inline ownership check rather than a region gate.",
  'lib/entities/notification/notifications.remote.ts#unsubscribeFromPush':
    "Deletes by endpoint AND the session user's id, so a caller who names somebody else's device deletes nothing.",
  'lib/entities/region/regions.remote.ts#createRegion':
    "Founds a new region, so there is no region to scope to yet: it takes a name only, and the founder's membership row is written from ctx.user rather than from the request.",
  'lib/entities/region/regions.remote.ts#leaveRegion':
    "Acts only on the caller's own membership: the row is found by regionFk plus ctx.user.id plus isActive, so a hostile regionFk can only name a region the caller is already in.",
  'lib/entities/region/regions.remote.ts#listMyInvitations':
    "Takes no input and reads only the invitations addressed to the session's own email, an address the client cannot name.",
  'lib/entities/user/users.remote.ts#updateUsername':
    "Writes only the username of the session user's own row, and the collision scope comes from the caller's own memberships rather than from the request.",
  'lib/entities/user/users.remote.ts#updateUserSettings':
    "Writes the session user's own settings row through the shared writer; the schema is a six-field preference allowlist and takes no id.",
  'lib/logging/errors.remote.ts#listErrorLogs':
    'Not region scoped: client_error_logs is global, and the handler gates itself on locals.userPermissions holding app.admin before it touches the privileged client.',
  'lib/logging/errors.remote.ts#logClientError':
    'Errors happen signed out, so this is open on purpose: it names no id, writes only into the global client_error_logs, and takes createdBy from the session rather than the payload.',
  'routes/(app)/settings/account.remote.ts#updateEmail':
    "Supabase applies the change to the session's own auth user, so the session cookie authorizes it and the double confirmation mail is what makes the new address prove itself.",
  'routes/(app)/settings/account.remote.ts#updatePassword':
    "Authorized by the session cookie plus a re-entry of the current password, checked against the session's own email; it names no account.",
  'routes/(landing)/auth/(tabs)/signin/signin.remote.ts#signIn':
    'Runs before authentication because it is the authentication, and the only path it takes back is validated same-origin.',
  'routes/(landing)/auth/(tabs)/signup/signup.remote.ts#signUp':
    'Runs before authentication and can only write rows for the auth user Supabase just returned, never for an id the request stated.',
  'routes/(landing)/auth/forgot-password/forgot-password.remote.ts#forgotPassword':
    'Runs before authentication and answers only into the mailbox it was given, never to the caller.',
  'routes/(landing)/auth/reset-password/reset-password.remote.ts#resetPassword':
    'Changes the password of whichever auth user the recovery session established by the emailed link belongs to, and it names no account.',
}

interface Handler {
  /** Identifiers called anywhere inside the handler, including one hop into a same-file helper. */
  calls: Set<string>
  file: string
  key: string
  name: string
}

/** Every identifier that appears in call position beneath `node`. */
function callees(node: ts.Node, into: Set<string>): Set<string> {
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child)) {
      const callee = child.expression
      if (ts.isIdentifier(callee)) into.add(callee.text)
      else if (ts.isPropertyAccessExpression(callee)) into.add(callee.name.text)
    }
    ts.forEachChild(child, visit)
  }
  visit(node)
  return into
}

function parseHandlers(file: string): Handler[] {
  const text = readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)

  // Same-file helpers, so one hop of indirection counts: `regionTagUsage` reaching `assertCanEdit`
  // through `editableTags` is asking permission just as much as calling it directly.
  const helpers = new Map<string, ts.Node>()
  ts.forEachChild(source, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name != null) helpers.set(node.name.text, node)
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer != null) helpers.set(decl.name.text, decl.initializer)
      }
    }
  })

  const handlers: Handler[] = []

  ts.forEachChild(source, (node) => {
    if (!ts.isVariableStatement(node)) return
    const exported = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
    if (!exported) return

    for (const decl of node.declarationList.declarations) {
      const init = decl.initializer
      if (init == null || !ts.isCallExpression(init) || !ts.isIdentifier(init.expression)) continue
      if (!WRAPPERS.has(init.expression.text)) continue
      if (!ts.isIdentifier(decl.name)) continue

      const direct = callees(init, new Set<string>())
      // One hop: pull in what each same-file helper this handler calls itself calls.
      for (const called of [...direct]) {
        const helper = helpers.get(called)
        if (helper != null) callees(helper, direct)
      }

      handlers.push({
        calls: direct,
        file: file.replace(/^src\//, ''),
        key: `${file.replace(/^src\//, '')}#${decl.name.text}`,
        name: decl.name.text,
      })
    }
  })

  return handlers
}

function remoteFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) remoteFiles(path, found)
    else if (entry.name.endsWith('.remote.ts')) found.push(path)
  }
  return found
}

const handlers = remoteFiles('src').flatMap(parseHandlers)
const ungated = handlers.filter((handler) => ![...handler.calls].some((call) => GATES.has(call)))

describe('remote handlers', () => {
  it('parses a plausible number of them', () => {
    // A guard on the parser itself. If a Kit change or a refactor moves how these are declared, the
    // walk finds nothing and every assertion below passes vacuously.
    expect(handlers.length).toBeGreaterThan(60)
  })

  it('each names a permission gate, or a written reason', () => {
    const unexplained = ungated.filter((handler) => NO_GATE[handler.key] == null).map((handler) => handler.key)

    expect(unexplained).toEqual([])
  })

  it('has no stale exemptions', () => {
    const keys = new Set(handlers.map((handler) => handler.key))
    expect(Object.keys(NO_GATE).filter((key) => !keys.has(key))).toEqual([])
  })

  it('exempts nothing that actually gates', () => {
    // An exemption that stops being true is worse than none: it reads as a decision somebody made.
    const ungatedKeys = new Set(ungated.map((handler) => handler.key))
    expect(Object.keys(NO_GATE).filter((key) => !ungatedKeys.has(key))).toEqual([])
  })
})
