import type { DisplayName } from '$lib/entities/displayName'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'

export const moderationGround: ['unlawful', 'harassment', 'personal_data', 'impersonation', 'spam', 'terms_breach'] = [
  'unlawful',
  'harassment',
  'personal_data',
  'impersonation',
  'spam',
  'terms_breach',
]
export type ModerationGround = (typeof moderationGround)[number]

/** What a removal can be started on: the thing the admin picked, not everything it took with it. */
export const removableKind: ['area', 'block', 'route', 'topo', 'ascent', 'file', 'comment'] = [
  'area',
  'block',
  'route',
  'topo',
  'ascent',
  'file',
  'comment',
]
export type RemovableKind = (typeof removableKind)[number]

/** Topos and media are hard deleted, so nothing of theirs can come back on an Undo or a reversal. */
export const goneForGood = (kind: RemovableKind): boolean => kind === 'file' || kind === 'topo'

/** Who took a comment down, which decides what its placeholder says. */
export const commentRemover: ['author', 'admin'] = ['author', 'admin']
export type CommentRemover = (typeof commentRemover)[number]

/** The reference a member quotes in an appeal. */
export const decisionRef = (id: number): string => `D-${id}`

export interface RemovedItem {
  kind: RemovableKind
  name: DisplayName
}

export const REASON_MAX = 500

export const removalSchema = z.object({
  ground: z.enum(moderationGround, { error: formError('form_required') }),
  reason: z
    .string({ error: formError('form_required') })
    .check(
      z.trim(),
      z.minLength(1, { error: formError('form_required') }),
      z.maxLength(REASON_MAX, { error: formError('form_charsMax', { count: REASON_MAX }) }),
    ),
})
export type RemovalInput = z.output<typeof removalSchema>

export const removableIdArgs = z.object({ id: z.number(), removal: z.optional(removalSchema) })

export const excerpt = (body: string) => (body.length > 80 ? `${body.slice(0, 79).trimEnd()}…` : body)

export const removalTargetSchema = z.object({ id: z.string().check(z.minLength(1)), kind: z.enum(removableKind) })

export interface RemovalItem {
  body?: string
  byline?: string
  /** Where the page leaves for: the item for a container, what holds it for the rest. */
  home: string
  image?: string
  /** The parent a container's delete leaves for. */
  parentFk?: null | number
  title: string
}

export interface RemovalPreview {
  item: RemovalItem
  names: string[]
  others: number
}
