import { ArrayComparator, type WatchedQueryComparator } from '@powersync/web'
import { zeroShapes } from './schema'

type Nested = undefined | { [key: string]: unknown; parent?: Nested[] }

/**
 * A watch emits only a changed result. ArrayComparator alone swallows an empty first result, which equals the
 * empty state before it, so the first result always emits here.
 */
export function changedRows<Row>(): WatchedQueryComparator<Row[]> {
  const rows = new ArrayComparator<Row>({ compareBy: (row) => JSON.stringify(row) })
  let delivered = false
  return {
    checkEquality: (current, previous) => {
      const same = delivered && rows.checkEquality(current, previous)
      delivered = true
      return same
    },
  }
}

/** A jsonb or array column, which arrives as JSON text. */
export function json<T = unknown>(text: unknown): null | T {
  return typeof text === 'string' ? (JSON.parse(text) as T) : null
}

/** An ISO timestamp or date as epoch ms. Cut to milliseconds first: some engines refuse microsecond fractions. */
export function ms(text: unknown): null | number {
  return typeof text === 'string' ? Date.parse(text.replace(/(\.\d{3})\d+/, '$1')) : null
}

const convert = { bool: (value: unknown) => value === 1, json, ms, plain: (value: unknown) => value }

/**
 * A synced row as Zero hands it to a mapper: camelCase names, the integer id, dates as epoch ms, jsonb parsed and
 * booleans as booleans. The mappers were written against that shape and stay unchanged.
 */
export function toZeroRow<Row = Record<string, unknown>>(table: keyof typeof zeroShapes, row: object): Row {
  const out: Record<string, unknown> = {}
  for (const [key, from, kind] of zeroShapes[table]) {
    const value = (row as Record<string, unknown>)[from]
    out[key] = value == null ? null : convert[kind](value)
  }
  return out as Row
}

/** A TanStack parent chain (each `parent` a one-row array) as Zero's `.related('parent').one()` nests it. */
export function unwrapParents(level: Nested): Record<string, unknown> | undefined {
  return level == null ? undefined : { ...level, parent: unwrapParents(level.parent?.[0]) }
}
