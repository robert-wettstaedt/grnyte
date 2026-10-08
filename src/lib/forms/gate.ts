import { resolveUnavailable, type QueryResource } from '$lib/zero/resource.svelte'

export type FormGateState =
  | { excluded: boolean; kind: 'offline' }
  | { kind: 'denied' }
  | { kind: 'error' }
  | { kind: 'loading' }
  | { kind: 'notFound'; title: string }
  | { kind: 'open' }

/** A row a form screen needs before its fields can render. */
export interface FormWait {
  /** Title of the not-found state when the row does not exist. */
  notFound: string
  resource: Pick<QueryResource<unknown>, 'availability' | 'isEmpty' | 'settled' | 'status'>
  /** Also wait for the related rows, for a form whose submit replaces lists it seeded. */
  whole?: boolean
}

/** What a form screen shows instead of its fields. Waits are read in order, so a row keyed off an
 *  earlier one is never judged on its placeholder id; permission needs the row, not its lists. */
export function resolveFormGate(
  waits: readonly FormWait[],
  { denied, online }: { denied: boolean; online: boolean },
): FormGateState {
  for (const { notFound, resource } of waits) {
    if (resolveUnavailable(resource)) {
      return { excluded: resource.availability === 'excluded', kind: 'offline' }
    }
    if (resource.status === 'error') {
      return { kind: 'error' }
    }
    if (resource.isEmpty) {
      return { kind: 'notFound', title: notFound }
    }
    if (resource.status === 'loading') {
      return { kind: 'loading' }
    }
  }

  if (denied) {
    return { kind: 'denied' }
  }

  // The row is local but its lists are not, and offline they are not coming.
  if (waits.some(({ resource, whole }) => whole === true && !resource.settled)) {
    return online ? { kind: 'loading' } : { excluded: false, kind: 'offline' }
  }

  return { kind: 'open' }
}
