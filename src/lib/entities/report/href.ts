import { resolve } from '$app/paths'
import type { RemovableKind } from '$lib/entities/moderation/dto'

export const reportFormHref = (kind: RemovableKind, id: number | string) =>
  resolve('/(app)/report/[kind=removable]/[id]', { id: String(id), kind })

/** The legal channel, carrying the reported page's address for the mail it opens. */
export const legalReportHref = (address: string) => `${resolve('/legal/report')}?content=${encodeURIComponent(address)}`
