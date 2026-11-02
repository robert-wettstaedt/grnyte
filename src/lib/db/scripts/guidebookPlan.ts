/**
 * The database-free half of `guidebook-import.ts`: the operation list step 3 of the guidebook pipeline writes
 * (`step3_ops.json`), and the helpers its writes are logged with. Every update carries the snapshot's value as
 * `old`; the writer refuses the run when the database no longer holds it.
 */
import { changed, diffChanges, type EventChange, type EventDiff } from '../../entities/event/event.server'
import * as z from '../../forms/zod'

const id = z.int().check(z.positive())
const text = z.nullable(z.string())
const int = z.nullable(z.int())
/** An existing row by id, or one the run creates by its key. */
const ref = z.union([z.strictObject({ id }), z.strictObject({ key: z.string() })])
const pair = <T extends z.ZodMiniType>(value: T) => z.strictObject({ new: value, old: value })
const point = z.strictObject({ estimated: z.boolean(), lat: z.number(), lng: z.number() })
const pin = z.nullable(z.strictObject({ lat: z.number(), lng: z.number() }))
/** A place as the snapshot held it: always a row that exists, or no parent at all. */
const oldRef = z.strictObject({ id: z.nullable(id) })

const opSchema = z.discriminatedUnion('op', [
  z.strictObject({ key: z.string(), name: z.string(), op: z.literal('create_fa') }),
  z.strictObject({
    description: text,
    key: z.string(),
    name: text,
    op: z.literal('create_area'),
    parent: z.nullable(ref),
    type: z.enum(['area', 'sector']),
  }),
  z.strictObject({
    id,
    op: z.literal('update_area'),
    set: z.strictObject({
      description: z.optional(pair(text)),
      name: z.optional(pair(text)),
      parent: z.optional(z.strictObject({ new: z.nullable(ref), old: oldRef })),
      type: z.optional(pair(z.nullable(z.enum(['area', 'sector'])))),
    }),
  }),
  z.strictObject({
    area: ref,
    description: text,
    key: z.string(),
    name: text,
    op: z.literal('create_block'),
    order: int,
    point: z.nullable(point),
  }),
  z.strictObject({
    id,
    op: z.literal('update_block'),
    set: z.strictObject({
      area: z.optional(z.strictObject({ new: ref, old: oldRef })),
      description: z.optional(pair(text)),
      name: z.optional(pair(text)),
      order: z.optional(z.strictObject({ new: z.int(), old: int })),
      point: z.optional(z.strictObject({ new: point, old: pin })),
    }),
  }),
  z.strictObject({
    block: ref,
    description: text,
    first_ascent: z.array(ref),
    first_ascent_year: int,
    grade: text,
    key: z.string(),
    name: text,
    op: z.literal('create_route'),
    rating: int,
    tags: z.array(z.string()),
  }),
  z.strictObject({
    add_tags: z.optional(z.array(z.string())),
    id,
    op: z.literal('update_route'),
    set: z.strictObject({
      block: z.optional(z.strictObject({ new: ref, old: oldRef })),
      description: z.optional(pair(text)),
      first_ascent: z.optional(z.strictObject({ new: z.array(ref), old: z.array(z.string()) })),
      first_ascent_year: z.optional(pair(int)),
      grade: z.optional(pair(text)),
      name: z.optional(pair(text)),
      rating: z.optional(pair(int)),
    }),
  }),
  z.strictObject({ id, new: z.string(), old: z.string(), op: z.literal('rename_fa') }),
  z.strictObject({ gone: id, into: id, op: z.literal('merge_fa') }),
  z.strictObject({ gone: id, into: id, op: z.literal('merge_route') }),
  z.strictObject({ gone: id, into: id, op: z.literal('merge_block') }),
  z.strictObject({ gone: id, into: id, op: z.literal('merge_area') }),
  z.strictObject({ id, op: z.literal('delete_route') }),
  z.strictObject({ id, op: z.literal('delete_block') }),
  z.strictObject({ id, op: z.literal('delete_area') }),
])

const opsSchema = z.strictObject({
  fp: z.unknown(),
  ops: z.array(opSchema),
  refs: z.array(z.strictObject({ kind: z.enum(['area', 'block', 'route']), ref: z.string(), target: ref })),
  // the region the exports came from; lists made before the exports recorded it have none
  region: z.optional(z.nullable(id)),
  source: z.string().check(z.minLength(1)),
})

export type EntityKind = 'area' | 'block' | 'route'
export type Op = z.infer<typeof opSchema>
export type Ops = z.infer<typeof opsSchema>
export type Ref = z.infer<typeof ref>

/** Validates untrusted JSON into an operation list, or throws every issue at once. */
export function parseOps(raw: unknown): Ops {
  const result = opsSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    throw new Error(`guidebook-import: the operation list is malformed:\n${issues.slice(0, 20).join('\n')}`)
  }
  return result.data
}

/** A Font grade as `grades.FB` stores it. */
export const fbLabel = (label: string) => `FB ${label}`

/** `grades.FB` as the operation list writes it. */
export const planLabel = (fb: null | string) => (fb?.startsWith('FB ') ? fb.slice(3) : fb)

/** Whether the database still holds the snapshot's value; null and '' are one text. */
export const holds = (now: unknown, old: unknown) =>
  typeof now === 'string' || typeof old === 'string'
    ? !changed((now as null | string) ?? null, (old as null | string) ?? null)
    : JSON.stringify(now ?? null) === JSON.stringify(old ?? null)

/** The `firstAscensionists` change column, spelled as `updateRouteRow` spells it. */
export const faColumn = (names: string[]) => [...names].sort().join(',')

/** `!routes:new:<key>!` (and blocks, areas): a link to a row the run creates, swapped for its id at the end. */
export const NEW_LINK = /!(routes|blocks|areas):new:([^!\s]+)!/g

/** Per entity, every column this run moved: the first old value and the last new one, diffed as `createUpdateEvent` diffs. */
export class ChangeLog {
  private readonly entries = new Map<string, { id: number; kind: EntityKind; new: EventDiff; old: EventDiff }>()

  /** The update events to write: entities whose columns ended where they started are left out. */
  events(): { changes: EventChange[]; id: number; kind: EntityKind }[] {
    return [...this.entries.values()]
      .map((entry) => ({ changes: diffChanges(entry.old, entry.new), id: entry.id, kind: entry.kind }))
      .filter((event) => event.changes.length > 0)
  }

  record(kind: EntityKind, id: number, column: string, oldValue: unknown, newValue: unknown) {
    const key = `${kind}:${id}`
    const entry = this.entries.get(key) ?? { id, kind, new: {}, old: {} }
    if (!(column in entry.old)) entry.old[column] = oldValue
    entry.new[column] = newValue
    this.entries.set(key, entry)
  }
}
