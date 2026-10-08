import type { ResolvedPathname } from '$app/types'
import { m } from '$lib/paraglide/messages'
import type { QueryPhase } from '$lib/zero/resource.svelte'

/** A row a form screen needs before its fields can render. */
export interface FormWait<T extends WaitRow = WaitRow> {
  /** Title of the not-found state when the row does not exist. */
  notFound: string
  resource: { readonly data: null | T | undefined; readonly phase: QueryPhase }
  /** Also wait for the related rows. Required: a form whose submit replaces a list it seeded must
   *  never get the weaker wait by omission. */
  whole: boolean
}

/** In order: a row keyed off an earlier one is only judged once that one is here. A tuple type, so
 *  a literal infers as one without `const`, which the Svelte ESLint parser rejects in `generics`. */
export type FormWaits = readonly [FormWait, ...FormWait[]]

/** Each wait's row, non-null and in the same position: what the fields receive once the gate opens. */
export type Waited<W extends FormWaits> = { [K in keyof W]: NonNullable<W[K]['resource']['data']> }

export interface WaitRow {
  readonly id: number | string
}

/** The state a form screen shows a reader who may not edit, with the way back to what it edits. */
export function noEditPermission(primaryAction: { href: ResolvedPathname; label: string }) {
  return { description: m.form_noEditPermission(), primaryAction, title: m.form_noPermissionTitle() }
}

/** Every row and the ids keying its seed, or undefined while any row is missing. */
export function waitedRows<W extends FormWaits>(waits: W): undefined | { key: string; rows: Waited<W> } {
  const rows = waits.map(({ resource }) => resource.data)
  if (rows.some((data) => data == null)) {
    return undefined
  }
  return { key: rows.map((data) => data!.id).join(':'), rows: rows as Waited<W> }
}
