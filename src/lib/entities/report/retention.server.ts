import { pinnedTx } from '$lib/db/pinned.server'
import { contentReports, type ContentReport } from '$lib/db/schema'
import { inArray } from 'drizzle-orm'
import { reportRef } from './dto'
import { closeReports } from './report.server'
import { reportTarget } from './target.server'

/** Reports whose object is gone, however it went, close as acted on: notice first, then the delete,
 *  so a notice that fails is retried on the next run. Returns how many closed. */
export async function closeGoneReports(): Promise<number> {
  const gone = await pinnedTx(async (tx) => {
    const open = await tx.query.contentReports.findMany()
    const closing: ContentReport[] = []
    for (const group of Map.groupBy(open, (report) => reportRef(report.objectType, report.objectId)).values()) {
      if ((await reportTarget(tx, group[0].objectType, group[0].objectId)) == null) closing.push(...group)
    }
    return closing
  })
  if (gone.length === 0) return 0

  await closeReports(gone, 'acted_on', null)
  await pinnedTx((tx) =>
    tx.delete(contentReports).where(
      inArray(
        contentReports.id,
        gone.map((report) => report.id),
      ),
    ),
  )
  return gone.length
}
