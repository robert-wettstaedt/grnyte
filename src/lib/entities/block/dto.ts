import type { AreaListItem } from '$lib/entities/area/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'

export type BlockListItem = {
  areas: AreaListItem[]
  id: number
  name: string
  order: number
  regionFk: number
}

export type BlockDetail = BlockListItem & {
  createdAt: Date | undefined
  geolocation: Geolocation | undefined
  /** One entry per topo image, in topo order: the `topos` row id (links to the
   *  topo page), `files.path` plus the stored EXIF-oriented pixel size (missing
   *  for files not yet backfilled). */
  topoImages: { id: number; path: string; width?: number; height?: number }[]
  /** The stored name as typed — empty for auto-numbered blocks. `name` is the display
   *  fallback ("Block 2"); editing must prefill from this so a blank block stays blank. */
  rawName: string
}
