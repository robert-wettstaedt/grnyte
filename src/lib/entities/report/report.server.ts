import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_READ } from '$lib/auth'
import { contentReports, regionMembers, rolePermissions, type ContentReport } from '$lib/db/schema'
import type { removalTargetSchema } from '$lib/entities/moderation/dto'
import { canModerate } from '$lib/entities/moderation/permissions'
import { itemOf } from '$lib/entities/moderation/preview.server'
import { notify } from '$lib/entities/notification/notification.server'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, eq, inArray } from 'drizzle-orm'
import { reportRef, type FileReportInput, type ReportNotice, type ReportPreview } from './dto'
import { canReport } from './permissions'
import { reportTarget, type ReportTarget } from './target.server'

type Caller = Pick<Context, 'afterCommit' | 'db' | 'user' | 'userRegions'>
type Target = z.output<typeof removalTargetSchema>

const onObject = ({ id, kind }: Target) => and(eq(contentReports.objectType, kind), eq(contentReports.objectId, id))

/** The privileged handle sees every region, so one the caller cannot read answers as missing. */
const visibleTarget = async ({ db, userRegions }: Pick<Caller, 'db' | 'userRegions'>, { id, kind }: Target) => {
  const target = await reportTarget(db, kind, id)
  return target && checkRegionPermission(userRegions, [REGION_PERMISSION_READ], target.regionFk) ? target : undefined
}

const requireReportable = (caller: Pick<Caller, 'db' | 'user' | 'userRegions'>, target: Target) =>
  requireRow(
    () => visibleTarget(caller, target),
    (row) => canReport(caller.userRegions, caller.user.id, row),
    formError('reports_notFound'),
  )

/** What the report form shows, refused like the report itself. */
export async function previewReport(
  target: Target,
  caller: Pick<Caller, 'db' | 'user' | 'userRegions'>,
): Promise<ReportPreview> {
  const { href } = await requireReportable(caller, target)
  const found = await itemOf(caller.db, target.kind, target.id)
  if (found == null) error(404, formError('reports_notFound'))
  return { ...found.item, href }
}

/** A comment goes unnamed: its words are its author's. */
const objectName = (kind: Target['kind'], target: Pick<ReportTarget, 'name'>) =>
  kind === 'comment' ? null : target.name

const reportNotice = (kind: Target['kind'], name: null | string, outcome?: ReportNotice['outcome']) =>
  JSON.stringify({ kind, name: name ?? undefined, outcome } satisfies ReportNotice)

/** One notice per reporter, written after the reports are gone. */
export async function closeReports(
  reports: Pick<ContentReport, 'objectId' | 'objectName' | 'objectType' | 'regionFk' | 'reporterFk'>[],
  outcome: NonNullable<ReportNotice['outcome']>,
  actorFk: null | number,
) {
  for (const report of reports) {
    await notify({
      actorFk,
      metadata: reportNotice(report.objectType, report.objectName, outcome),
      objectRef: reportRef(report.objectType, report.objectId),
      regionFk: report.regionFk,
      sourceType: 'report_closed',
      userFks: [report.reporterFk],
    })
  }
}

/** Needs a privileged handle. A removal closes the reports on what it removed at once, so an Undo
 *  before the cleanup task runs finds none to bring back. */
export async function closeReportsOn(
  db: Pick<Context['db'], 'delete' | 'query'>,
  target: Target,
  afterCommit: Context['afterCommit'],
) {
  const reports = await db.query.contentReports.findMany({ where: onObject(target) })
  if (reports.length === 0) return
  await db.delete(contentReports).where(byIds(reports))
  afterCommit(() => closeReports(reports, 'acted_on', null))
}

/** Needs a privileged handle. The content stays: each reporter hears so, and the reports go. */
export async function dismissReportsRow({ id, kind }: Target, caller: Caller) {
  const { afterCommit, db, user, userRegions } = caller
  // Refused as missing, never as forbidden: a 403 would tell an author their content is reported.
  const reports = await requireRow(
    async () => {
      const rows = await db.query.contentReports.findMany({ where: onObject({ id, kind }) })
      if (rows.length === 0 || !canModerate(userRegions, rows[0].regionFk)) return undefined
      const admins = await regionAdmins(db, rows[0].regionFk)
      return reviewers(admins, rows[0].authorFk).includes(user.id) ? rows : undefined
    },
    () => true,
    formError('reports_notFound'),
  )
  await db.delete(contentReports).where(byIds(reports))
  afterCommit(() => closeReports(reports, 'stays', user.id))
}

/** Exactly the reports that were read: one filed meanwhile stays open for its own notice. */
const byIds = (reports: Pick<ContentReport, 'id'>[]) =>
  inArray(
    contentReports.id,
    reports.map((report) => report.id),
  )

/** Needs a privileged handle. Upserts the caller's one open report; the admins hear of an object's first. */
export async function fileReportRow({ ground, id, kind, note }: FileReportInput, caller: Caller) {
  const { afterCommit, db, user } = caller
  const target = await requireReportable(caller, { id, kind })
  const open = await db.query.contentReports.findFirst({ columns: { id: true }, where: onObject({ id, kind }) })
  const name = objectName(kind, target)
  const noted = note || null
  await db
    .insert(contentReports)
    .values({
      authorFk: target.authorFk,
      ground,
      note: noted,
      objectId: id,
      objectName: name,
      objectType: kind,
      regionFk: target.regionFk,
      reporterFk: user.id,
    })
    .onConflictDoUpdate({
      set: { ground, note: noted, objectName: name },
      target: [contentReports.reporterFk, contentReports.objectType, contentReports.objectId],
    })
  if (open != null) return

  const admins = await regionAdmins(db, target.regionFk)
  afterCommit(() =>
    notify({
      actorFk: user.id,
      metadata: reportNotice(kind, name),
      objectRef: reportRef(kind, id),
      regionFk: target.regionFk,
      sourceType: 'content_reported',
      userFks: reviewers(admins, target.authorFk),
    }),
  )
}

/** Who reviews reports on an author's content: the region's other admins, or the author when no other exists. */
export const reviewers = (admins: number[], authorFk: null | number): number[] => {
  const others = admins.filter((admin) => admin !== authorFk)
  return others.length > 0 ? others : admins
}

export async function regionAdmins(db: Pick<Context['db'], 'selectDistinct'>, regionFk: number): Promise<number[]> {
  const rows = await db
    .selectDistinct({ userFk: regionMembers.userFk })
    .from(regionMembers)
    .innerJoin(rolePermissions, eq(rolePermissions.role, regionMembers.role))
    .where(
      and(
        eq(regionMembers.regionFk, regionFk),
        eq(regionMembers.isActive, true),
        eq(rolePermissions.permission, REGION_PERMISSION_DELETE),
      ),
    )
  return rows.map((row) => row.userFk)
}
