<script lang="ts">
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { afterClick } from '$lib/components/Modal/nested'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { areaTypeLabel } from '$lib/entities/area/mapper'
  import { canAddArea, canAddBlock } from '$lib/entities/area/permissions'
  import { areaMapList } from '$lib/entities/area/resources.svelte'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { blockMapList, blockRouteList } from '$lib/entities/block/resources.svelte'
  import { crumbs } from '$lib/entities/merge/sides'
  import { regionDisplayName } from '$lib/entities/region/mapper'
  import { canAddRoute } from '$lib/entities/route/permissions'
  import { orderRoutesByTopo } from '$lib/entities/topo/order'
  import { blockTopoList } from '$lib/entities/topo/resources.svelte'
  import { nameCollator } from '$lib/i18n/collator'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { motion } from '$lib/state/motion.svelte'
  import { quietly } from '$lib/state/pill.svelte'
  import { untrack } from 'svelte'
  import { fade } from 'svelte/transition'
  import type { PickerItem } from './GuidebookPicker.svelte'
  import MovePanel from './MovePanel.svelte'
  import { moveWithUndo, type MoveKind } from './moves'

  interface Props {
    /** The parent the rows sit under now: their area for blocks and areas (null at the top), their block for routes. */
    from: null | number
    ids: number[]
    kind: MoveKind
    /** What moves, for the title; several rows are counted instead. */
    name?: string
    /** After the move went through, before its Undo is offered. */
    onmoved?: () => void
    open: boolean
    regionFk: number
    /** Routes only: the lines their old block's photos would lose, which the server checks again. */
    topoLines?: number
  }

  let { from, ids, kind, name, onmoved, open = $bindable(), regionFk, topoLines = 0 }: Props = $props()

  const global = getGlobalState()
  const areas = areaMapList()
  const blocks = blockMapList()
  const byName = nameCollator()
  const settled = $derived(areas.phase.kind === 'answered' && (kind !== 'routes' || blocks.phase.kind === 'answered'))

  const regionAreas = $derived(areas.data.filter((area) => area.regionFk === regionFk))
  const regionName = $derived.by(() => {
    const region = global.userRegions.find((row) => row.regionFk === regionFk)
    return region == null ? '' : regionDisplayName(region)
  })
  const parentOf = (id: null | number) => regionAreas.find((area) => area.id === id)?.parentFk ?? null

  /** An area being moved, or anything beneath one: never a place to put it. */
  const inside = (area: AreaDetail) =>
    kind === 'areas' && [area.id, ...area.areas.map((a) => a.id)].some((id) => ids.includes(id))

  let at = $state<null | number>(null)
  /** Routes only: the block opened inside `at`. */
  let atBlock = $state<null | number>(null)
  let query = $state('')
  let confirming = $state<null | { id: null | number; name: string }>(null)
  // On opening only: data syncing in while it is open must not throw the reader back to the start.
  $effect(() => {
    if (!open) return
    untrack(() => {
      query = ''
      confirming = null
      atBlock = null
      // Among the siblings: an area's are in its parent, a block's sector's are one level up.
      at =
        kind === 'routes'
          ? (blocks.data.find((block) => block.id === from)?.areaFk ?? null)
          : kind === 'areas'
            ? from
            : parentOf(from)
    })
  })

  const openedBlock = $derived(atBlock == null ? undefined : blocks.data.find((block) => block.id === atBlock))
  const { routes, topos } = quietly(() => ({
    routes: blockRouteList(() => atBlock ?? 0),
    topos: blockTopoList(() => atBlock ?? 0),
  }))
  // In-memory twin of `inAreaOrder`: by slot, then id.
  const bySlot = (a: BlockDetail, b: BlockDetail) => a.order - b.order || a.id - b.id

  // Block rows sit beside area rows in one list, so their row ids are negated to never collide.
  const blockRowId = (id: number) => -id
  const isBlockRow = (item: PickerItem) => item.id < 0

  // Browsing lists one level, which the breadcrumb names; a search spans the region, so its rows say where.
  const areaItem = (area: AreaDetail, search: boolean): PickerItem => {
    const base: PickerItem = {
      badge: area.type == null ? undefined : areaTypeLabel(area.type),
      crumbs: search ? crumbs(area) : undefined,
      id: area.id,
      openable: true,
      title: area.name,
    }
    if (inside(area)) return { ...base, openable: false, reason: m.moves_reasonSelf() }
    if (kind === 'areas' && area.type === 'sector') return { ...base, dimmed: true, openable: false }
    if (kind === 'blocks' && area.id === from) return { ...base, openable: false, reason: m.moves_reasonCurrent() }
    if (kind === 'blocks' && area.type !== 'area' && !canAddBlock(global.userRegions, area)) {
      return { ...base, openable: false, reason: m.moves_reasonNoEdit() }
    }
    return base
  }
  const blockItem = (block: BlockDetail, search: boolean): PickerItem => {
    const reason =
      block.id === from
        ? m.moves_reasonCurrent()
        : canAddRoute(global.userRegions, block)
          ? undefined
          : m.moves_reasonNoEdit()
    return {
      crumbs: search ? crumbs(block) : undefined,
      id: blockRowId(block.id),
      openable: reason == null,
      reason,
      title: block.name,
    }
  }

  const items = $derived.by((): PickerItem[] => {
    const term = query.trim().toLowerCase()
    const sorted = <T extends { name: string }>(rows: T[]) => rows.toSorted((a, b) => byName.compare(a.name, b.name))
    if (term !== '') {
      if (kind === 'routes') {
        return sorted(
          blocks.data.filter((block) => block.regionFk === regionFk && block.name.toLowerCase().includes(term)),
        ).map((block) => blockItem(block, true))
      }
      return sorted(regionAreas.filter((area) => area.name.toLowerCase().includes(term))).map((area) =>
        areaItem(area, true),
      )
    }
    // Held back until the topos are in: the picker keeps the first order it shows.
    if (openedBlock != null) {
      if (topos.phase.kind !== 'answered') return []
      return orderRoutesByTopo(routes.data, topos.data).map((route) => ({
        id: route.id,
        info: true,
        title: route.name,
      }))
    }
    const children = sorted(regionAreas.filter((area) => (area.parentFk ?? null) === at)).map((area) =>
      areaItem(area, false),
    )
    if (at == null || kind === 'areas') return children
    const here = blocks.data.filter((block) => block.areaFk === at).toSorted(bySlot)
    if (kind === 'routes') return [...here.map((block) => blockItem(block, false)), ...children]
    return [
      ...here.map((block): PickerItem => ({ id: blockRowId(block.id), info: true, title: block.name })),
      ...children,
    ]
  })

  const current = $derived(regionAreas.find((area) => area.id === at))
  const path = $derived([
    { id: null as null | number, label: regionName },
    ...(current == null ? [] : [...current.areas, current]).map((area) => ({ id: area.id, label: area.name })),
    ...(openedBlock == null ? [] : [{ id: blockRowId(openedBlock.id), label: openedBlock.name }]),
  ])

  type Target = { hint: string } | { id: null | number; label: string; name: string }
  const target = $derived.by((): Target => {
    if (query.trim() !== '') return { hint: m.moves_openResult() }
    if (kind === 'routes') {
      if (openedBlock == null) return { hint: m.moves_openBlock() }
      if (openedBlock.id === from) return { hint: m.moves_reasonCurrent() }
      if (!canAddRoute(global.userRegions, openedBlock)) return { hint: m.moves_reasonNoEdit() }
      return { id: openedBlock.id, label: m.moves_into({ name: openedBlock.name }), name: openedBlock.name }
    }
    if (kind === 'blocks' && (current == null || current.type === 'area')) return { hint: m.moves_openSector() }
    if ((at ?? null) === from) return { hint: m.moves_reasonCurrent() }
    if (current == null) {
      return global.userRegions.some((r) => r.regionFk === regionFk)
        ? { id: null, label: m.moves_topLevel(), name: regionName }
        : { hint: m.moves_reasonNoEdit() }
    }
    const may = kind === 'areas' ? canAddArea(global.userRegions, current) : canAddBlock(global.userRegions, current)
    return may
      ? { id: current.id, label: m.moves_into({ name: current.name }), name: current.name }
      : { hint: m.moves_reasonNoEdit() }
  })

  const commit = async (id: null | number, name: string) => {
    open = false
    await moveWithUndo(kind, ids, id, topoLines, name)
    onmoved?.()
  }

  const confirm = () => {
    if (!('id' in target)) return
    const { id, name } = target
    if (kind === 'routes' && topoLines > 0) afterClick(() => (confirming = { id, name }))
    else void commit(id, name)
  }

  const go = (item: PickerItem) =>
    afterClick(() => {
      query = ''
      if (isBlockRow(item)) {
        const blockId = blockRowId(item.id)
        at = blocks.data.find((block) => block.id === blockId)?.areaFk ?? at
        atBlock = blockId
        return
      }
      atBlock = null
      at = item.id
    })
  const jump = (id: null | number) =>
    afterClick(() => {
      atBlock = null
      at = id
    })
</script>

{#snippet footer()}
  {#if confirming != null}
    {@const { id, name } = confirming}
    <div class="flex w-full flex-col gap-2 md:flex-row-reverse" in:fade={{ duration: motion() }}>
      <!-- The button that opened this step is gone, so focus would fall back to the page. -->
      <button
        class="btn preset-filled-primary-500 active:scale-[0.97] md:flex-1"
        onclick={() => void commit(id, name)}
        type="button"
        {@attach (button) => button.focus()}
      >
        {m.moves_confirm()}
      </button>
      <button
        class="btn preset-tonal active:scale-[0.97] md:flex-1"
        onclick={() => afterClick(() => (confirming = null))}
        type="button"
      >
        {m.common_back()}
      </button>
    </div>
  {:else if 'id' in target}
    <!-- Wraps rather than clips: the label is the only place that names where the move goes. -->
    <button
      class="btn preset-filled-primary-500 h-auto min-h-10 w-full py-2 text-balance whitespace-normal active:scale-[0.97]"
      onclick={confirm}
      type="button"
      in:fade={{ duration: motion() }}
    >
      {target.label}
    </button>
  {:else}
    <!-- Text at the button's height, not a disabled button: it explains, it is not something to tap. -->
    <p
      class="text-surface-600-400 flex min-h-10 w-full items-center justify-center text-center text-sm text-balance"
      in:fade={{ duration: motion() }}
    >
      {target.hint}
    </p>
  {/if}
{/snippet}

<Modal
  backdrop
  bind:open
  contentClass="w-full max-w-sm max-h-[80dvh]"
  {footer}
  snapPoints={[0.6, 0.9]}
  panel
  panelClass="fixed inset-0 z-60 flex items-center justify-center p-4"
  title={ids.length === 1 && name != null ? m.moves_titleNamed({ name }) : m.moves_titleMany({ count: ids.length })}
>
  <MovePanel
    bind:query
    warning={confirming == null ? undefined : m.moves_topoWarning({ count: topoLines, name: confirming.name })}
    emptyLabel={query.trim() === '' ? m.moves_emptyHere() : m.moves_empty()}
    {items}
    onjump={jump}
    onopen={go}
    onpick={go}
    {path}
    placeholder={kind === 'routes' ? m.moves_searchBlocks() : m.moves_searchAreas()}
    settled={settled && (openedBlock == null || (routes.phase.kind === 'answered' && topos.phase.kind === 'answered'))}
  />
</Modal>
