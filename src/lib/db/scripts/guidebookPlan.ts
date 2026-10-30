/** The database-free half of `guidebook-import.ts`: the plan's shape and the rules it is read by. */
import { changed, diffChanges, type EventChange, type EventDiff } from '../../entities/event/event.server'
import * as z from '../../forms/zod'

const id = z.int().check(z.positive())
const text = z.nullable(z.string())
const year = z.nullable(z.int())
/** The offline tool writes book references as either; they are only ever compared and printed. */
const bookRef = z.nullable(z.union([z.string(), z.number()]))
const pair = <T extends z.ZodMiniType>(value: T) => z.strictObject({ new: value, old: value })

const routeUpdateSchema = z.strictObject({
  description: z.optional(pair(text)),
  first_ascent: z.optional(z.strictObject({ new: text, old: z.nullable(z.array(z.string())) })),
  first_ascent_year: z.optional(pair(year)),
  grade: z.optional(pair(text)),
  name: z.optional(pair(z.string())),
})

const createSchema = z.strictObject({
  area: id,
  block: z.nullable(id),
  book: bookRef,
  book_block: bookRef,
  description: text,
  first_ascent: text,
  first_ascent_year: year,
  grade: text,
  // Null for a `?` route the book leaves unnamed; written as the empty name the app stores for one.
  name: text,
  new_block: text,
  page: z.number(),
  y: z.number(),
})

const moveSchema = z.strictObject({ block: z.nullable(id), book_block: bookRef, new_block: text, route: id })

/** A sector for a level the first import flattened: created under `area`, which then holds only sectors. */
const newSectorSchema = z.strictObject({
  area: id,
  blocks: z.array(id),
  // The book blocks whose new blocks go into this sector rather than into `area`.
  book_blocks: z.array(z.string()),
  description: text,
  // Deleted blocks that join this sector instead if a topo or file hangs on them at import time.
  keep: z.optional(z.array(id)),
  key: z.string(),
  name: z.string(),
})

const planSchema = z.strictObject({
  block_renames: z.optional(z.array(z.tuple([id, z.string()]))),
  create: z.optional(z.array(createSchema)),
  delete: z.optional(z.array(id)),
  delete_blocks: z.optional(z.array(id)),
  merge: z.optional(z.array(z.tuple([id, id]))),
  moves: z.optional(z.array(moveSchema)),
  new_sectors: z.optional(z.array(newSectorSchema)),
  relics: z.optional(z.record(z.string().check(z.regex(/^(routes|blocks|areas):[1-9]\d*$/)), z.string())),
  sector_parents: z.optional(z.array(z.tuple([id, z.nullable(id), z.string()]))),
  sector_renames: z.optional(z.array(z.tuple([id, z.string()]))),
  updates: z.optional(z.record(z.string().check(z.regex(/^[1-9]\d*$/)), routeUpdateSchema)),
})

export type Create = z.infer<typeof createSchema>
export type EntityKind = 'area' | 'block' | 'route'
export type Move = z.infer<typeof moveSchema>
/** A planned new block: one per (area, book block), shared by the creates and moves naming it. */
export interface NewBlock {
  area: number
  bookBlock: string
  creates: Create[]
  moves: number[]
  name: string
}
export type NewSector = z.infer<typeof newSectorSchema>
export type Plan = Required<z.infer<typeof planSchema>>

/** A route's state in the plan's own terms, as the exporter wrote `old`. */
export interface RouteState {
  description: null | string
  first_ascent: string[]
  first_ascent_year: null | number
  grade: null | string
  name: string
}

export type RouteUpdate = z.infer<typeof routeUpdateSchema>

/** Validates untrusted JSON into a plan with every list present, or throws every issue at once. */
export function parsePlan(raw: unknown): Plan {
  const result = planSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    throw new Error(`guidebook-import: the plan is malformed:\n${issues.join('\n')}`)
  }
  const plan = result.data
  return {
    block_renames: plan.block_renames ?? [],
    create: plan.create ?? [],
    delete: plan.delete ?? [],
    delete_blocks: plan.delete_blocks ?? [],
    merge: plan.merge ?? [],
    moves: plan.moves ?? [],
    new_sectors: plan.new_sectors ?? [],
    relics: plan.relics ?? {},
    sector_parents: plan.sector_parents ?? [],
    sector_renames: plan.sector_renames ?? [],
    updates: plan.updates ?? {},
  }
}

/** "A. Fels, B. Berg & C. Stein" into its names. */
export const splitFirstAscent = (names: null | string): string[] =>
  (names ?? '')
    .split(/, | & | und |\s*\/\s*/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0)

/** The plan's grade label as `grades.FB` stores it. */
export const fbLabel = (label: string) => `FB ${label}`

/** `grades.FB` as the plan writes it. */
export const planLabel = (fb: null | string) => (fb?.startsWith('FB ') ? fb.slice(3) : fb)

const sameNames = (a: string[], b: string[]) => {
  const key = (names: string[]) => JSON.stringify(names.map((name) => name.toLowerCase()).sort())
  return key(a) === key(b)
}

/**
 * Fields of `update` whose `side` the route does not hold. Names compare case-insensitively because
 * first ascensionists are reused that way; a description by `changed`, so null and '' are one value.
 */
export function staleFields(state: RouteState, update: RouteUpdate, side: 'new' | 'old'): (keyof RouteUpdate)[] {
  const stale: (keyof RouteUpdate)[] = []
  if (update.name != null && state.name !== update.name[side]) stale.push('name')
  if (update.grade != null && state.grade !== update.grade[side]) stale.push('grade')
  if (update.first_ascent_year != null && state.first_ascent_year !== update.first_ascent_year[side]) {
    stale.push('first_ascent_year')
  }
  if (update.description != null && changed(state.description, update.description[side])) stale.push('description')
  if (update.first_ascent != null) {
    const expected = side === 'old' ? (update.first_ascent.old ?? []) : splitFirstAscent(update.first_ascent.new)
    if (!sameNames(state.first_ascent, expected)) stale.push('first_ascent')
  }
  return stale
}

/** The `firstAscensionists` change column, spelled as `updateRouteRow` spells it. */
export const faColumn = (names: string[]) => [...names].sort().join(',')

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

/** Reading order on the page, which is the only order a route has: `routes` has no slot, so its id is it. */
export const byPage = (a: Pick<Create, 'page' | 'y'>, b: Pick<Create, 'page' | 'y'>) => a.page - b.page || a.y - b.y

const bookOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

/** Instructions that cannot all hold, found from the plan alone. */
export function conflicts(plan: Plan): string[] {
  const errors: string[] = []
  const copies = plan.merge.map(([copy]) => copy)
  const kept = new Set(plan.merge.map(([, keep]) => keep))
  const deleted = new Set(plan.delete)
  const moved = plan.moves.map((move) => move.route)
  const relicRoutes = Object.keys(plan.relics)
    .filter((key) => key.startsWith('routes:'))
    .map((key) => Number(key.slice('routes:'.length)))

  const twice = (what: string, ids: number[]) => {
    for (const dup of new Set(ids.filter((value, index) => ids.indexOf(value) !== index))) {
      errors.push(`${what} ${dup} is listed twice`)
    }
  }
  twice('merge copy', copies)
  twice('deleted route', plan.delete)
  twice('moved route', moved)
  twice(
    'renamed block',
    plan.block_renames.map(([block]) => block),
  )
  twice(
    'renamed sector',
    plan.sector_renames.map(([area]) => area),
  )
  twice(
    're-parented sector',
    plan.sector_parents.map(([area]) => area),
  )

  const touched = [
    ['updated', Object.keys(plan.updates).map(Number)],
    ['relic', relicRoutes],
    ['moved', moved],
    ['deleted', plan.delete],
    ['kept', [...kept]],
  ] as const
  for (const [copy, keep] of plan.merge) {
    if (copy === keep) errors.push(`merge ${copy} into itself`)
    for (const [what, ids] of touched) {
      if (ids.includes(copy)) errors.push(`route ${copy} is merged away but also ${what}`)
    }
    if (deleted.has(keep)) errors.push(`route ${keep} keeps a merge but is also deleted`)
  }
  for (const route of plan.delete) {
    for (const [what, ids] of touched.slice(0, 3)) {
      if (ids.includes(route)) errors.push(`route ${route} is deleted but also ${what}`)
    }
  }
  for (const route of relicRoutes) {
    if (plan.updates[route]?.description != null) errors.push(`route ${route} has a relic and a description update`)
  }

  const keys = plan.new_sectors.map((sector) => sector.key)
  for (const dup of new Set(keys.filter((key, index) => keys.indexOf(key) !== index))) {
    errors.push(`new sector key ${dup} is listed twice`)
  }
  twice('deleted block', plan.delete_blocks)
  twice(
    'block put into a new sector',
    plan.new_sectors.flatMap((sector) => sector.blocks),
  )
  const sectorBlocks = new Set(plan.new_sectors.flatMap((sector) => sector.blocks))
  for (const block of plan.delete_blocks) {
    if (sectorBlocks.has(block)) errors.push(`block ${block} is deleted but also put into a new sector`)
  }
  for (const sector of plan.new_sectors) {
    if (sector.name.trim() === '') errors.push(`new sector ${sector.key} has no name; a sector must have one`)
    for (const block of sector.keep ?? []) {
      if (!plan.delete_blocks.includes(block)) errors.push(`new sector ${sector.key} keeps block ${block}, not deleted`)
    }
  }
  return errors
}

/**
 * The new blocks the plan asks for, in the order they are appended to their area: by the first route
 * on the page, then by book block for blocks only moves fill. `areaOfRoute` is where a move starts.
 */
export function planNewBlocks(
  plan: Pick<Plan, 'create' | 'moves'>,
  areaOfRoute: (routeId: number) => number | undefined,
): { blocks: NewBlock[]; errors: string[] } {
  const blocks = new Map<string, NewBlock>()
  const errors: string[] = []

  const claim = (area: number, bookBlock: Create['book_block'], name: null | string, who: string) => {
    if (bookBlock == null || name == null) {
      errors.push(`${who} names neither a block nor a new block with its book block`)
      return undefined
    }
    const key = `${area}:${bookBlock}`
    const block = blocks.get(key) ?? { area, bookBlock: String(bookBlock), creates: [], moves: [], name }
    if (block.name !== name) errors.push(`${who} names new block "${name}", another entry "${block.name}"`)
    blocks.set(key, block)
    return block
  }

  for (const create of plan.create) {
    if (create.block != null) continue
    claim(
      create.area,
      create.book_block,
      create.new_block,
      `create "${create.name}" (page ${create.page})`,
    )?.creates.push(create)
  }
  for (const move of plan.moves) {
    if (move.block != null) continue
    const area = areaOfRoute(move.route)
    if (area == null) continue
    claim(area, move.book_block, move.new_block, `move of route ${move.route}`)?.moves.push(move.route)
  }

  const first = (block: NewBlock) => [...block.creates].sort(byPage)[0]
  const ordered = [...blocks.values()].sort((a, b) => {
    const [fa, fb] = [first(a), first(b)]
    if (fa != null && fb != null) return byPage(fa, fb) || bookOrder(a.bookBlock, b.bookBlock)
    if (fa != null || fb != null) return fa == null ? 1 : -1
    return bookOrder(a.bookBlock, b.bookBlock)
  })
  return { blocks: ordered, errors }
}
