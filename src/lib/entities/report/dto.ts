import {
  moderationGround,
  REASON_MAX,
  removalTargetSchema,
  type ModerationGround,
  type RemovableKind,
  type RemovalItem,
} from '$lib/entities/moderation/dto'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'

export const reportSchema = z.object({
  ground: z.enum(moderationGround, { error: formError('form_required') }),
  note: z.optional(
    z.string().check(z.trim(), z.maxLength(REASON_MAX, { error: formError('form_charsMax', { count: REASON_MAX }) })),
  ),
})
export type ReportInput = z.output<typeof reportSchema>

export const fileReportSchema = z.extend(removalTargetSchema, reportSchema.shape)
export type FileReportInput = z.output<typeof fileReportSchema>

/** What a report notice's `metadata` holds. No name for a comment: its words are its author's. */
export interface ReportNotice {
  kind: RemovableKind
  name?: string
  outcome?: 'acted_on' | 'stays'
}

/** What the report form shows: the removal form's item, plus where the reported thing itself lives. */
export type ReportPreview = RemovalItem & { href: string }

/** A report notice's `object_ref`, which keeps one per object in the notifications key. */
export const reportRef = (kind: RemovableKind, id: string): string => `${kind}:${id}`

/** One reported object in its region's queue. */
export interface ReportedObject {
  /** Most reported first. */
  grounds: ModerationGround[]
  href: string
  id: string
  kind: RemovableKind
  name: string
  /** Undefined on the caller's own content. */
  newestAt: number | undefined
  /** The caller's own content, shown only because no other admin can review it: grounds alone. */
  own: boolean
  reports: { createdAt: number; ground: ModerationGround; note: string | undefined; reporterName: string }[]
}
