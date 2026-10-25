import { removalTargetSchema } from '$lib/entities/moderation/dto'
import { asPrivileged, defineServerMutator } from '$lib/zero/serverMutator.server'
import { fileReportSchema } from './dto'
import { dismissReportsRow, fileReportRow } from './report.server'

// Privileged: `content_reports` has no write policy; each body gates on the stored object or its reports.
export const reportsServerMutatorDefs = {
  reports: {
    dismiss: defineServerMutator(removalTargetSchema, async ({ args, ctx, tx }) => {
      await asPrivileged(tx, (db) => dismissReportsRow(args, { ...ctx, db }))
    }),
    file: defineServerMutator(fileReportSchema, async ({ args, ctx, tx }) => {
      await asPrivileged(tx, (db) => fileReportRow(args, { ...ctx, db }))
    }),
  },
}
