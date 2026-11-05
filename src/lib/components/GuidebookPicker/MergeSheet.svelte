<script lang="ts">
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { areaTypeLabel } from '$lib/entities/area/mapper'
  import { areaMapList } from '$lib/entities/area/resources.svelte'
  import { mergeAreas } from '$lib/entities/area/writes'
  import { blockMapList } from '$lib/entities/block/resources.svelte'
  import { mergeBlocks } from '$lib/entities/block/writes'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { conflicts, stepAfterPick } from '$lib/entities/merge/fields'
  import { mergePreview, type MergePreview } from '$lib/entities/merge/merge.remote'
  import {
    areaSide,
    blockSide,
    MERGE_FIELDS,
    routeSide,
    type MergeKind,
    type MergeSide,
  } from '$lib/entities/merge/sides'
  import { toRouteDetail } from '$lib/entities/route/mapper'
  import { mergeRoutes } from '$lib/entities/route/writes'
  import { nameCollator } from '$lib/i18n/collator'
  import { resolveMessage } from '$lib/i18n/message'
  import { formatCoord } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages'
  import { runCommand } from '$lib/remote/mutation'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { quietly } from '$lib/state/pill.svelte'
  import { notifyError } from '$lib/state/toast'
  import { queries } from '$lib/zero/queries'
  import { createResource } from '$lib/zero/resource.svelte'
  import { untrack } from 'svelte'
  import type { PickerItem } from './GuidebookPicker.svelte'
  import MergePanel, { type MergeQuestion } from './MergePanel.svelte'

  interface Props {
    kind: MergeKind
    open: boolean
    /** Routes only: the sector their siblings are listed from. */
    sectorId?: number
    source: MergeSide
  }

  let { kind, open = $bindable(), sectorId, source }: Props = $props()

  const global = getGlobalState()
  const byName = nameCollator()
  let query = $state('')
  let step = $state<'confirm' | 'fields' | 'pick'>('pick')
  let survivor = $state<MergeSide | null>(null)
  let chosen = $state<Record<string, 'source' | 'survivor'>>({})
  let preview = $state<MergePreview | null>(null)

  // On opening only, so rows syncing in while it is open never throw the person back to the start.
  $effect(() => {
    if (!open) return
    untrack(() => {
      query = ''
      step = 'pick'
      survivor = null
      chosen = {}
      preview = null
    })
  })

  const areas = areaMapList()
  const blocks = blockMapList()
  // Routes are not all on the device, so the region is searched by name and the sector lists the siblings.
  const { matches, siblings } = quietly(() => ({
    matches: createResource(
      () => queries.listRoutes({ content: query.trim(), pageSize: 50, regionFk: source.regionFk, sort: 'name' }),
      (rows) => rows.map(toRouteDetail),
      { enabled: () => kind === 'routes' && query.trim() !== '' },
    ),
    siblings: createResource(
      () => queries.listRoutes({ areaId: sectorId, pageSize: 200, regionFk: source.regionFk, sort: 'name' }),
      (rows) => rows.map(toRouteDetail),
      { enabled: () => kind === 'routes' && sectorId != null },
    ),
  }))

  const candidates = $derived.by((): MergeSide[] => {
    const term = query.trim().toLowerCase()
    const named = (side: MergeSide) => term === '' || side.name.toLowerCase().includes(term)
    const rows =
      kind === 'areas'
        ? areas.data.map(areaSide)
        : kind === 'blocks'
          ? blocks.data.map(blockSide)
          : [...siblings.data, ...matches.data].map(routeSide)
    const unique = new Map(
      rows.filter((side) => side.regionFk === source.regionFk && side.id !== source.id).map((s) => [s.id, s]),
    )
    return [...unique.values()].filter(named).toSorted((a, b) => byName.compare(a.name, b.name))
  })
  // What an area holds once the source has left it, so a parent whose only child is the source holds nothing.
  const holding = (area: AreaDetail | undefined) =>
    area?.type === 'area' && !areas.data.some((a) => a.parentFk === area.id && a.id !== source.id) ? null : area?.type
  const item = (side: MergeSide): PickerItem => {
    const base = { crumbs: side.crumbs, id: side.id, title: side.name }
    if (kind !== 'areas') return base
    const area = areas.data.find((a) => a.id === side.id)
    const typed = { ...base, badge: area?.type == null ? undefined : areaTypeLabel(area.type) }
    // The server refuses both of these too.
    if (area?.areas.some((a) => a.id === source.id)) return { ...typed, reason: m.merges_reasonInside() }
    const into = holding(area)
    const from = holding(areas.data.find((a) => a.id === source.id))
    // The badges say why: blocks and areas never share a parent.
    return into == null || from == null || into === from ? typed : { ...typed, dimmed: true }
  }
  // A route's siblings are its sector's, not just its block's.
  const inSector = $derived(new Set(siblings.data.map((route) => route.id)))
  const isSibling = (side: MergeSide) => (kind === 'routes' ? inSector.has(side.id) : side.parentId === source.parentId)
  // The heading names where nearby blocks and areas sit; a route's crumb still tells its block apart.
  const nearby = (side: MergeSide) => (kind === 'routes' ? item(side) : { ...item(side), crumbs: undefined })
  const pinned = $derived(query.trim() === '' ? candidates.filter(isSibling).map(nearby) : [])
  const items = $derived(query.trim() === '' ? [] : candidates.map(item))
  const settled = $derived(
    kind === 'areas'
      ? areas.phase.kind === 'answered'
      : kind === 'blocks'
        ? blocks.phase.kind === 'answered'
        : siblings.phase.kind === 'answered' && (query.trim() === '' || matches.phase.kind === 'answered'),
  )

  const asking = $derived(
    survivor == null
      ? []
      : conflicts(
          survivor.fields,
          source.fields,
          MERGE_FIELDS[kind].map((field) => field.key),
        ),
  )

  const shown = (side: MergeSide, key: string): string => {
    const value = side.fields[key]
    if (key === 'gradeFk') return gradeLabel(global.grades, global.gradingScale, value as number)
    if (key === 'rating') return '★'.repeat(Number(value))
    if (key === 'geolocationFk' && side.geolocation != null)
      return formatCoord([side.geolocation.lat, side.geolocation.long])
    return String(value ?? '')
  }

  // Duplicates usually share a name, so the copy tells the two apart by where each sits.
  const named = (side: MergeSide) => {
    const other = side.id === source.id ? survivor : source
    const where = side.crumbs.at(-1)
    return other?.name === side.name && where != null && where !== other.crumbs.at(-1)
      ? `${side.name} (${where})`
      : side.name
  }

  const questions = $derived(
    survivor == null
      ? []
      : MERGE_FIELDS[kind]
          .filter((field) => asking.includes(field.key))
          .map((field): MergeQuestion => ({
            key: field.key,
            label: resolveMessage(field.label),
            options: [
              {
                caption: m.merges_onSurvivor({ name: named(survivor!) }),
                side: 'survivor',
                value: shown(survivor!, field.key),
              },
              { caption: m.merges_onSource({ name: named(source) }), side: 'source', value: shown(source, field.key) },
            ],
          })),
  )

  const pick = (picked: PickerItem) => {
    survivor = candidates.find((side) => side.id === picked.id) ?? null
    if (survivor == null) return
    chosen = Object.fromEntries(asking.map((key) => [key, 'survivor' as const]))
    step = stepAfterPick(asking)
  }

  const countLabels = $derived([
    m.merges_countAscents(),
    m.merges_countPhotos(),
    ...(kind === 'routes' ? [] : [m.merges_countTopos(), m.merges_countChildren()]),
  ])

  // Counts come from the server: a block's or area's ascents are never all on the device.
  $effect(() => {
    if (step !== 'confirm' || survivor == null) return
    const args = { kind, sourceId: source.id, survivorId: survivor.id }
    untrack(() => {
      preview = null
      mergePreview(args)
        .then((answer) => (preview = answer))
        .catch(notifyError)
    })
  })

  const merge = async () => {
    if (survivor == null) return
    // Values, not sides: the server writes what was on screen, whatever synced since.
    const values = Object.fromEntries(
      asking.map((key) => [key, (chosen[key] === 'source' ? source : survivor!).fields[key]]),
    )
    const args = { sourceId: source.id, survivorId: survivor.id, values }
    try {
      open = false
      await runCommand(
        kind === 'areas'
          ? mergeAreas(args)
          : kind === 'blocks'
            ? mergeBlocks(args)
            : mergeRoutes({ ...args, knownTopoLines: preview?.topoLinesRemoved ?? 0 }),
      )
    } catch (cause) {
      notifyError(cause)
    }
  }
</script>

<Modal
  backdrop
  bind:open
  contentClass="w-full max-w-sm max-h-[85dvh]"
  snapPoints={[0.6, 0.9]}
  panel
  panelClass="fixed inset-0 z-60 flex items-center justify-center p-4"
  title={m.merges_title({ name: source.name })}
>
  <MergePanel
    bind:chosen
    bind:query
    confirm={{
      body: survivor == null ? '' : m.merges_confirmBody({ source: named(source), survivor: named(survivor) }),
      countLabels,
      counts:
        preview == null
          ? null
          : [preview.ascents, preview.photos, preview.topos, preview.children]
              .slice(0, countLabels.length)
              .map((value, i) => ({ label: countLabels[i], value })),
      onback: () => (step = asking.length > 0 ? 'fields' : 'pick'),
      onmerge: merge,
      // Only a route leaving its block can lose lines: every line sits on its own block's photos.
      warnable: kind === 'routes' && survivor?.parentId !== source.parentId,
      warning:
        preview != null && preview.topoLinesRemoved > 0
          ? m.merges_topoLines({ count: preview.topoLinesRemoved })
          : undefined,
    }}
    fields={{
      onback: () => (step = 'pick'),
      onnext: () => (step = 'confirm'),
      questions,
    }}
    pick={{
      emptyLabel: query.trim() === '' ? m.merges_searchHint() : m.merges_empty(),
      items,
      onpick: pick,
      pinned,
      pinnedLabel:
        kind === 'routes'
          ? m.merges_siblingsRoutes()
          : kind === 'blocks'
            ? m.merges_siblingsBlocks()
            : m.merges_siblingsAreas(),
      placeholder: m.merges_search(),
      settled,
    }}
    {step}
  />
</Modal>
