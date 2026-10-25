import { pinnedTx } from '$lib/db/pinned.server'
import { contentReports, users } from '$lib/db/schema'
import { toAuthor } from '$lib/entities/displayName'
import { moderationGround, type ModerationGround } from '$lib/entities/moderation/dto'
import { desc, eq } from 'drizzle-orm'
import { reportRef, type ReportedObject } from './dto'
import { regionAdmins, reviewers } from './report.server'
import { reportTarget, type ReportTarget } from './target.server'

/** The caller has checked that they moderate `regionFk`. Objects already gone are left out, and so is
 *  the caller's own content while another admin can review it; with nobody else, they see its grounds only. */
export async function readRegionReports(regionFk: number, callerFk: number): Promise<ReportedObject[]> {
  return pinnedTx(async (tx) => {
    const admins = await regionAdmins(tx, regionFk)
    const rows = await tx
      .select({ report: contentReports, reporterName: users.username })
      .from(contentReports)
      .leftJoin(users, eq(users.id, contentReports.reporterFk))
      .where(eq(contentReports.regionFk, regionFk))
      .orderBy(desc(contentReports.createdAt))
    const byObject = Map.groupBy(rows, ({ report }) => reportRef(report.objectType, report.objectId))

    const queue: ReportedObject[] = []
    // Last and in a fixed order: placed among the others, an own row would say when it was reported.
    const own: ReportedObject[] = []
    for (const group of byObject.values()) {
      const { objectId, objectType } = group[0].report
      const target = await reportTarget(tx, objectType, objectId)
      if (target == null) continue
      if (!reviewers(admins, target.authorFk).includes(callerFk)) continue
      if (target.authorFk === callerFk) {
        own.push(
          ownReported(
            group.map(({ report }) => report.ground),
            target,
            objectId,
            objectType,
          ),
        )
        continue
      }
      queue.push({
        grounds: byCount(group.map(({ report }) => report.ground)),
        href: target.href,
        id: objectId,
        kind: objectType,
        name: target.name,
        newestAt: group[0].report.createdAt.getTime(),
        own: false,
        reports: group.map(({ report, reporterName }) => ({
          createdAt: report.createdAt.getTime(),
          ground: report.ground,
          note: report.note ?? undefined,
          reporterName: toAuthor(report.reporterFk, reporterName ?? undefined).name,
        })),
      })
    }
    return [...queue, ...own.sort((a, b) => reportRef(a.kind, a.id).localeCompare(reportRef(b.kind, b.id)))]
  })
}

/** No reporter, note, count or time: in a region with one admin, any of them can point to who reported. */
const ownReported = (
  grounds: ModerationGround[],
  target: Pick<ReportTarget, 'href' | 'name'>,
  id: string,
  kind: ReportedObject['kind'],
): ReportedObject => ({
  grounds: moderationGround.filter((ground) => grounds.includes(ground)),
  href: target.href,
  id,
  kind,
  name: target.name,
  newestAt: undefined,
  own: true,
  reports: [],
})

/** Distinct, most reported first, ties in the form's order. */
const byCount = (grounds: ModerationGround[]): ModerationGround[] =>
  moderationGround
    .filter((ground) => grounds.includes(ground))
    .sort((a, b) => grounds.filter((g) => g === b).length - grounds.filter((g) => g === a).length)
