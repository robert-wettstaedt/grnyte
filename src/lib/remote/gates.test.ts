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
import { dirname, join } from 'node:path'
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
 * - `addParkingRow` and `restoreParkingRow` check `canAddParking` on the stored area; `deleteParkingRow` checks
 *   `canDeleteParking` on the stored geolocation
 * - `createAreaRow` checks `canAddArea` on the region and the stored parent; `updateAreaRow` loads it through
 *   `requireEditableArea`
 * - `deleteAreaRow` loads the area through `requireRow` with `canDeleteArea`; `restoreAreaRow` gates a recreate on
 *   `canAddArea` and an undelete on `canDeleteArea`, both on stored rows
 * - `createBlockRow` checks `canAddBlock` on the stored area; `updateBlockRow` loads the block through `requireRowForm`
 *   with `canEditBlock`, and the pin writers through `requireRow` with the same
 * - `deleteBlockRow` loads the block through `requireRow` with `canDeleteBlock`; `restoreBlockRow` gates a recreate on
 *   `canAddBlock` and an undelete on `canDeleteBlock`; `reorderBlocksRow` loads the area through `requireRow`
 * - `createAscentRow` checks `canLogAscent` on the stored route; `updateAscentRow` loads the ascent through
 *   `requireRowForm` with `canEditAscent`, and `deleteAscentRow` through `requireRow` with the same
 * - `deleteMediaFileRow` checks `canDeleteFile` on the stored file; `setFileVisibilityRow` and `setVideoSourceRow`
 *   load it through `requireEditableFile`
 * - `createTopoRow` and `reorderToposRow` load the block through `requireEditableTopoBlock`; `deleteTopoRow` and
 *   `replaceTopoImageRow` load the topo through `requireEditableTopoWithFile`, `saveTopoLinesRow` through
 *   `requireEditableTopo`
 * - `toggleReactionRow`, `postCommentRow`, `deleteCommentRow` and `restoreCommentRow` load the event or the
 *   comment through `requireRow`, checked against the stored row
 * - the region bodies in `edit.server.ts`, `invitations.server.ts` and `members.server.ts` each start with
 *   `canEditRegion` / `assertCanEdit` on the submitted region, or load the invitation through
 *   `loadEditable`; `acceptMyInvitationRow` matches the invitation to the session's own address
 * - `transferRegionOwnership`, `deleteRegion` and `previewRegionDeletion` start with `requireOwner`, which
 *   compares the stored `regions.created_by` with the session's user; the two writers ask again under the
 *   members lock before they write
 * - `createRouteRow` checks `canAddRoute` on the stored block
 * - `deleteRouteRow` loads the route through `requireRow` with `canDeleteRoute`
 * - `planAreaMerge` loads the stored source through `requireRow` with `canDeleteArea` and the survivor with
 *   `canEditArea` plus the source's region, before the privileged repointing runs
 * - `planBlockMerge` loads the stored source through `requireRow` with `canDeleteBlock` and the survivor with
 *   `canEditBlock` plus the source's region, before the privileged repointing runs
 * - `planRouteMerge` loads the stored source through `requireRow` with `canDeleteRoute` and the survivor with
 *   `canEditRoute` plus the source's region, before the privileged repointing runs
 * - `moveAreasRow` loads each stored area through `requireRow` with `canEditArea`, and the stored parent,
 *   when there is one, with `canAddArea` plus the area's region
 * - `moveBlocksRow` loads the stored area through `requireRow` with `canAddBlock`, and each block with
 *   `canEditBlock` plus the area's region
 * - `moveRoutesRow` loads the stored block through `requireRow` with `canAddRoute`, and each route with
 *   `canEditRoute` plus the block's region
 * - `restoreRouteRow` gates a recreate on `canAddRoute` and an undelete on `canDeleteRoute`, both on stored rows
 * - `setFavorite` 404s unless the stored entity is in a region the caller may read (`checkRegionPermission`)
 * - `updateRouteRow` loads the route through `requireRowForm` with `canEditRoute`
 * - `verifyUpload` proves ownership of the host-side video object
 * - `previewRemoval` loads the row through `requireRow` and checks `region.delete` on its stored region
 * - `undoRemovalRow` loads the decision through `requireRow` and checks `canModerate` on its stored region, or app admin
 * - `readStatement` 404s unless the session is a subject of the stored decision or an app admin
 * - `fileReportRow` loads the object through `requireRow` with `canReport` on its stored region and author;
 *   `dismissReportsRow` loads the object's reports through `requireRow` with `canModerate` on their region
 * - `previewReport` loads the object through `requireRow` with `canReport`, as `fileReportRow` does
 *
 * Adding a name here that does NOT gate would quietly defeat the whole check, which is why the list
 * is short and why the reason is written down.
 */
const GATES = new Set([
  'acceptInvitation',
  'acceptMyInvitationRow',
  'addParkingRow',
  'addRegionTagRow',
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
  'canModerate',
  'canReadRegion',
  'checkRegionPermission',
  'createAreaRow',
  'createAscentRow',
  'createBlockRow',
  'createRouteRow',
  'createTopoRow',
  'deleteAreaRow',
  'deleteAscentRow',
  'deleteBlockRow',
  'deleteCommentRow',
  'deleteMediaFileRow',
  'deleteParkingRow',
  'deleteRegion',
  'deleteRouteRow',
  'deleteTopoRow',
  'dismissReportsRow',
  'estimateBlockLocationRow',
  'fileReportRow',
  'inviteRegionMemberRow',
  'moveAreasRow',
  'moveBlocksRow',
  'moveRoutesRow',
  'planAreaMerge',
  'planBlockMerge',
  'planRouteMerge',
  'postCommentRow',
  'previewRegionDeletion',
  'previewRemoval',
  'previewReport',
  'readStatement',
  'removeRegionMemberRow',
  'removeRegionTagRow',
  'renameRegionTagRow',
  'reorderBlocksRow',
  'reorderToposRow',
  'replaceTopoImageRow',
  'requireEditableArea',
  'requireEditableFile',
  'requireEditableTopo',
  'requireEditableTopoBlock',
  'requireEditableTopoWithFile',
  'requireRow',
  'requireRowForm',
  'resendInvitation',
  'resendRegionInvitationRow',
  'resolveAttachRegion',
  'restoreAreaRow',
  'restoreBlockRow',
  'restoreCommentRow',
  'restoreInvitation',
  'restoreParkingRow',
  'restoreRegionInvitationRow',
  'restoreRegionMemberRow',
  'restoreRouteRow',
  'revokeInvitation',
  'revokeRegionInvitationRow',
  'saveTopoLinesRow',
  'setBlockLocationRow',
  'setFavorite',
  'setFileVisibilityRow',
  'setVideoSourceRow',
  'toggleReactionRow',
  'transferRegionOwnership',
  'undoRemovalRow',
  'updateAreaRow',
  'updateAscentRow',
  'updateBlockRow',
  'updateRegionMapLayersRow',
  'updateRegionMemberRoleRow',
  'updateRegionRow',
  'updateRouteRow',
  'verifyUpload',
])

/** The wrappers that make an export a remote function, or a nested property a server mutator. */
const WRAPPERS = new Set(['authedCommand', 'authedQuery', 'command', 'form', 'query'])
const MUTATOR_WRAPPERS = new Set(['defineServerMutator'])

/**
 * Handlers that legitimately name no gate, each with the reason.
 *
 * Filling this in IS the audit: a handler arrives here only after somebody has read it and decided.
 * Keyed `file#export` so a rename shows up as one stale entry and one ungated handler rather than
 * silently carrying its exemption to a different function.
 */
const NO_GATE: Record<string, string> = {
  'lib/auth/methods/identities.remote.ts#mailForwardingQuery':
    "Takes no input: reads only the live caller's own address and whether Apple still forwards to it (`requireLiveSession`).",
  'lib/auth/methods/identities.remote.ts#signInMethodsQuery':
    "Takes no input: reads only the live caller's own identities and password flag (`requireLiveSession`).",
  'lib/auth/methods/identities.remote.ts#unlinkProvider':
    "Removes only the caller's own identity through its own session client, behind an `identity.unlink` grant for its own session (`reauthCaller`, `hasGrant`) that the identity trigger spends.",
  'lib/auth/password/password.remote.ts#setNewPassword':
    "Acts only on the caller's own session and refuses unless a code was verified on it within 10 minutes (`amr`).",
  'lib/auth/reauth/reauth.remote.ts#confirmReauthCode':
    'Writes a grant bound to the verified caller and its session (`reauthCaller`, 401 without `session_id`); the action that later spends it gates itself.',
  'lib/auth/reauth/reauth.remote.ts#reauthGrantStatus':
    "Reads only the caller's own grant for its own session (`reauthCaller`), answering confirmed or not.",
  'lib/auth/reauth/reauth.remote.ts#requestReauthCode':
    "Mails a code to the session's own verified address for its own session (`reauthCaller`), capped at 5 an hour; it grants nothing by itself.",
  'lib/auth/session.remote.ts#sendPasswordReset':
    "Takes no input: mails the standard reset link to the session's own verified address, which only that inbox can use.",
  'lib/auth/session.remote.ts#signedInDevices':
    "Reads only the verified caller's own `auth.sessions` rows (`user_id` = `sub`), and never their address or browser.",
  'lib/auth/session.remote.ts#signOut':
    'Acts on whatever session the request already carries and revokes only that one; the sole input is a redirect path, validated same-origin.',
  'lib/auth/session.remote.ts#signOutDevice':
    "Deletes a session only where `user_id` is the verified caller's and the id is not the calling session, in one statement.",
  'lib/auth/session.remote.ts#signOutOthers':
    "Ends the caller's own other sessions at GoTrue, which any live session of the account may do anyway.",
  'lib/entities/event/events.remote.ts#userContributionCount':
    'Counts on the RLS connection, so the region scope is the "region.read can read events" policy rather than anything the handler restates; the only input is the id of the user whose number is on screen.',
  'lib/entities/feedback/feedback.remote.ts#listFeedback': 'Global, not region scoped; gated on app.admin.',
  'lib/entities/feedback/feedback.remote.ts#replyToFeedback': 'Same app.admin gate; recipient from the stored row.',
  'lib/entities/feedback/mutators.server.ts#feedback.submit':
    "Privileged: a new row only, `createdBy` from the session, and the mutate endpoint's verified token is the gate.",
  'lib/entities/file/files.remote.ts#createBunnyVideo':
    "Takes no id at all: it mints an empty video object in the caller's own host collection, and the region gate runs at finalizeVideo, which is where an entity to attach to is finally named.",
  'lib/entities/moderation/moderation.remote.ts#listDecisions':
    'Not region scoped: it lists the decisions of every region for the operator. Gated on app.admin through requireAppAdmin, like listErrorLogs.',
  'lib/entities/notification/mutators.server.ts#notifications.markFeedSeen':
    "Moves the caller's own feed watermark: the settings row is addressed by the session user, and `userId` only steers the client's optimistic write.",
  'lib/entities/notification/mutators.server.ts#notifications.markRead':
    "Marks only the session user's unread rows; `userId` only steers the client's optimistic write.",
  'lib/entities/notification/mutators.server.ts#notifications.subscribePush':
    "Privileged, because the endpoint may be another account's row: every owner column comes from the session, and the keys and `setWhere` refuse a takeover.",
  'lib/entities/notification/mutators.server.ts#notifications.unsubscribePush':
    "Deletes by endpoint AND the session user's id, so naming somebody else's device deletes nothing.",
  'lib/entities/notification/notifications.remote.ts#sendTestPush':
    "Looks the subscription up by endpoint AND the session user's id, so an endpoint belonging to somebody else simply reads back as not found.",
  'lib/entities/region/mutators.server.ts#regions.create':
    'Privileged: a new region only, its founder from the session, the cap checked under the founder lock.',
  'lib/entities/region/mutators.server.ts#regions.leave':
    "Only the caller's own membership, found by regionFk plus ctx.user.id.",
  'lib/entities/region/regions.remote.ts#listMyInvitations':
    "Takes no input and reads only the invitations addressed to the session's own email, an address the client cannot name.",
  'lib/entities/region/stats.remote.ts#listAllRegions':
    'Not region scoped: it lists every region for the operator, so there is no region to gate in. Gated on locals.userPermissions holding app.admin before it touches the privileged client, like listErrorLogs and listFeedback.',
  'lib/entities/user/mutators.server.ts#users.updateSettings':
    "The session user's own settings row, through the shared writer, from a preference allowlist that takes no id.",
  'lib/entities/user/mutators.server.ts#users.updateUsername':
    "Only the session user's own row, with the collision scope from the caller's own memberships.",
  'lib/logging/errors.remote.ts#listErrorLogs':
    'Not region scoped: client_error_logs is global, and the handler gates itself on locals.userPermissions holding app.admin before it touches the privileged client.',
  'lib/logging/errors.remote.ts#logClientError':
    'Errors happen signed out, so this is open on purpose: it names no id, writes only into the global client_error_logs, and takes createdBy from the session rather than the payload.',
  'routes/(app)/settings/account.remote.ts#accountDeletionPreview':
    "Reads only the session's own memberships and their regions' member counts, by the session's id; it names no other account.",
  'routes/(app)/settings/account.remote.ts#confirmEmailChangeCode':
    "Checks a code GoTrue mailed for the session's own pending email change; GoTrue applies it to that account only.",
  'routes/(app)/settings/account.remote.ts#deleteAccountCommand':
    "Acts only on the session's own account: the ids come from the verified session, a spent re-authentication grant (a mailed code) authorizes it, and it names no other account or region.",
  'routes/(app)/settings/account.remote.ts#updateEmail':
    "Supabase applies the change to the session's own auth user, so the session cookie authorizes it and the mailed codes are what make the new address prove itself.",
  'routes/(app)/settings/account.remote.ts#updateEmailCommand':
    'The same body as `updateEmail`: the session cookie authorizes it and the mailed codes prove the new address.',
  'routes/(app)/settings/account.remote.ts#updatePassword':
    "Authorized by the session cookie plus a spent re-authentication grant, bound to the session's own account; it names no account.",
  'routes/(app)/settings/account.remote.ts#updatePasswordCommand':
    "The same body as `updatePassword`: the session cookie plus a spent re-authentication grant for the session's own account.",
  'routes/(app)/settings/sync/syncHealth.remote.ts#syncHealth':
    'Not region scoped: it relays the public /health/sync verdict and touches no data. Gated on app.admin through requireAppAdmin, like listErrorLogs.',
  'routes/(landing)/auth/(tabs)/signin/signin.remote.ts#signIn':
    'Runs before authentication because it is the authentication, and the only path it takes back is validated same-origin.',
  'routes/(landing)/auth/(tabs)/signup/signup.remote.ts#confirmSignupCode':
    'Runs before authentication: the mailed code is the proof, counted per address before GoTrue sees it.',
  'routes/(landing)/auth/(tabs)/signup/signup.remote.ts#resendSignupCode':
    'Runs before authentication, behind proof of work, and only mails the address given; without its token it flags the account first.',
  'routes/(landing)/auth/(tabs)/signup/signup.remote.ts#signUp':
    'Runs before authentication and creates only a GoTrue account for the address given; the profile comes later, for the verified caller.',
  'routes/(landing)/auth/forgot-password/forgot-password.remote.ts#confirmResetCode':
    'Runs before authentication: the mailed code is the proof, counted per address before GoTrue sees it.',
  'routes/(landing)/auth/forgot-password/forgot-password.remote.ts#forgotPassword':
    'Runs before authentication and answers only into the mailbox it was given, never to the caller.',
  'routes/(landing)/auth/profile/profile.remote.ts#completeProfile':
    "Creates only the verified caller's own profile (`claims.sub`), refuses a deleted account, and returns a validated same-origin path.",
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

/** A file's top-level functions and initialised variables, by name. */
function declarations(source: ts.SourceFile): Map<string, ts.Node> {
  const found = new Map<string, ts.Node>()
  ts.forEachChild(source, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name != null) found.set(node.name.text, node)
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer != null) found.set(decl.name.text, decl.initializer)
      }
    }
  })
  return found
}

const parse = (file: string) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)

function parseHandlers(file: string): Handler[] {
  const source = parse(file)

  // Same-file helpers, so one hop of indirection counts: `regionTagUsage` reaching `assertCanEdit`
  // through `editableTags` is asking permission every bit as much as calling it directly.
  const helpers = declarations(source)
  const bodies = serverBodies(file, source)

  const handlers: Handler[] = []
  const add = (name: string, init: ts.Node) => {
    const direct = callees(init, new Set<string>())
    const referenced = references(init)
    // One hop: pull in what each same-file helper this handler calls itself calls.
    for (const called of [...direct]) {
      const helper = helpers.get(called)
      if (helper == null) continue
      callees(helper, direct)
      references(helper, referenced)
    }
    for (const reference of referenced) for (const call of bodies.get(reference) ?? []) direct.add(call)
    handlers.push({
      calls: direct,
      file: file.replace(/^src\//, ''),
      key: `${file.replace(/^src\//, '')}#${name}`,
      name,
    })
  }
  // Server mutators sit in nested object literals: `{ routes: { update: defineServerMutator(...) } }`.
  const mutatorsIn = (node: ts.Node, path: string[]) => {
    if (!ts.isObjectLiteralExpression(node)) return
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue
      const init = property.initializer
      const at = [...path, property.name.text]
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && MUTATOR_WRAPPERS.has(init.expression.text)) {
        add(at.join('.'), init)
      } else {
        mutatorsIn(init, at)
      }
    }
  }

  ts.forEachChild(source, (node) => {
    if (!ts.isVariableStatement(node)) return
    const exported = node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
    if (!exported) return

    for (const decl of node.declarationList.declarations) {
      const init = decl.initializer
      if (init == null || !ts.isIdentifier(decl.name)) continue
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && WRAPPERS.has(init.expression.text)) {
        add(decl.name.text, init)
      } else {
        mutatorsIn(init, [])
      }
    }
  })

  return handlers
}

/** What `name` calls, plus one hop into the same module's helpers. */
function reach(decls: Map<string, ts.Node>, name: string): Set<string> {
  const decl = decls.get(name)
  if (decl == null) return new Set<string>()
  const calls = callees(decl, new Set<string>())
  for (const called of [...calls]) {
    const helper = decls.get(called)
    if (helper != null) callees(helper, calls)
  }
  return calls
}

/** Every identifier and `namespace.member` beneath `node`, called or passed. */
function references(node: ts.Node, into = new Set<string>()): Set<string> {
  if (ts.isIdentifier(node)) into.add(node.text)
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    into.add(`${node.expression.text}.${node.name.text}`)
  }
  ts.forEachChild(node, (child) => void references(child, into))
  return into
}

function remoteFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) remoteFiles(path, found)
    else if (entry.name.endsWith('.remote.ts') || entry.name === 'mutators.server.ts') found.push(path)
  }
  return found
}

/** A handler body lifted into a `.server` module (`command(body.x)`, `command(signOutOthers)`): its
 *  callees plus one hop into that module's own helpers, so the lift hides no gate. */
function serverBodies(file: string, source: ts.SourceFile): Map<string, Set<string>> {
  const bodies = new Map<string, Set<string>>()
  for (const node of source.statements) {
    const target = serverImport(file, node)
    const bindings = target == null ? undefined : (node as ts.ImportDeclaration).importClause?.namedBindings
    if (target == null || bindings == null) continue
    const decls = declarations(parse(target))
    const names: [string, string][] = ts.isNamespaceImport(bindings)
      ? [...decls.keys()].map((name) => [`${bindings.name.text}.${name}`, name])
      : bindings.elements.map((element) => [element.name.text, (element.propertyName ?? element.name).text])
    for (const [local, name] of names) bodies.set(local, reach(decls, name))
  }
  return bodies
}

/** The file a `$lib/` or relative `.server` import names, else null. */
function serverImport(file: string, node: ts.Node): null | string {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return null
  const spec = node.moduleSpecifier.text
  if (!spec.endsWith('.server')) return null
  if (spec.startsWith('$lib/')) return `src/lib/${spec.slice(5)}.ts`
  return spec.startsWith('.') ? join(dirname(file), `${spec}.ts`) : null
}

const handlers = remoteFiles('src').flatMap(parseHandlers)
const ungated = handlers.filter((handler) => ![...handler.calls].some((call) => GATES.has(call)))

/** `reauthCaller` calls `requireLiveSession` itself (another file, so the walk cannot see it). */
const LIVE_CHECKS = ['authedRls', 'reauthCaller', 'requireLiveSession']
const AUTH_FILES = /^(lib\/auth\/|routes\/\(landing\)\/auth\/|routes\/\(app\)\/settings\/account\.remote\.ts)/
const liveScope = handlers.filter((handler) => AUTH_FILES.test(handler.file) || handler.calls.has('requireAppAdmin'))

/** Auth exports that run before a session exists, or on one that cannot be checked this way. */
const PRE_SESSION: Record<string, string> = {
  'lib/auth/password/password.remote.ts#setNewPassword':
    'Runs on the session a reset code just made, and checks its `amr` for that code instead.',
  'lib/auth/session.remote.ts#signOut':
    'Ends the session the request carries; a revoked one must still clear its cookies.',
  'routes/(landing)/auth/(tabs)/signin/signin.remote.ts#signIn': 'Makes the session.',
  'routes/(landing)/auth/(tabs)/signup/signup.remote.ts#confirmSignupCode': 'Makes the session.',
  'routes/(landing)/auth/(tabs)/signup/signup.remote.ts#resendSignupCode': 'Before any session.',
  'routes/(landing)/auth/(tabs)/signup/signup.remote.ts#signUp': 'Before any session.',
  'routes/(landing)/auth/forgot-password/forgot-password.remote.ts#confirmResetCode': 'Makes the session.',
  'routes/(landing)/auth/forgot-password/forgot-password.remote.ts#forgotPassword': 'Before any session.',
}

describe('remote handlers and server mutators', () => {
  it('parses server mutators too', () => {
    // The same vacuity guard for the nested shape: a walk that misses it would pass every mutator.
    expect(handlers.some((handler) => handler.key === 'lib/entities/route/mutators.server.ts#routes.update')).toBe(true)
  })

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

  it('checks the session is live in every auth, account and admin export, or says why not', () => {
    const unchecked = liveScope
      .filter((handler) => !LIVE_CHECKS.some((check) => handler.calls.has(check)))
      .map((handler) => handler.key)

    expect(unchecked.filter((key) => PRE_SESSION[key] == null)).toEqual([])
    expect(Object.keys(PRE_SESSION).filter((key) => !unchecked.includes(key))).toEqual([])
    expect(liveScope.some((handler) => handler.key.endsWith('#listDecisions'))).toBe(true)
  })

  it('exempts nothing that actually gates', () => {
    // An exemption that stops being true is worse than none: it reads as a decision somebody made.
    const ungatedKeys = new Set(ungated.map((handler) => handler.key))
    expect(Object.keys(NO_GATE).filter((key) => !ungatedKeys.has(key))).toEqual([])
  })
})
