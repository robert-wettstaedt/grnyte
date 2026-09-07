import { nameCollator } from '$lib/i18n/collator'
import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { FirstAscensionist, FirstAscensionistGroup } from './dto'

export type FirstAscensionistRow = QueryRow<typeof queries.listFirstAscensionists>

/** Collapses the region-scoped rows into one entry per climber, sorted by name. */
export function groupFirstAscensionists(firstAscensionists: FirstAscensionist[]): FirstAscensionistGroup[] {
  const byName = new Map<string, FirstAscensionistGroup>()

  for (const fa of firstAscensionists) {
    const key = fa.name.trim().toLowerCase()
    const group = byName.get(key)

    if (group == null) {
      byName.set(key, { ids: [fa.id], name: fa.name, userFk: fa.userFk })
    } else {
      group.ids.push(fa.id)
      group.userFk ??= fa.userFk
    }
  }

  const collator = nameCollator()
  return [...byName.values()].sort((a, b) => collator.compare(a.name, b.name))
}

export function toFirstAscensionist(row: FirstAscensionistRow): FirstAscensionist {
  return {
    id: row.id,
    name: row.name,
    userFk: row.userFk ?? undefined,
    username: row.user?.username,
  }
}
