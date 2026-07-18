<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import KbdTooltip from '$lib/components/KbdTooltip/KbdTooltip.svelte'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import type { RouteListItem } from '$lib/entities/route/dto'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import type { TopoEditor } from '$lib/entities/topo/editor.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { fly, slide } from 'svelte/transition'

  interface Props {
    /** Whether the current user may delete the route entity (region permission). */
    canDelete: boolean
    editor: TopoEditor
    onDeleteRoute: () => void
    /** The currently selected route (the line being edited). */
    route: Pick<RouteListItem, 'gradeFk' | 'id' | 'name'>
  }

  const { canDelete, editor, onDeleteRoute, route }: Props = $props()
  const global = getGlobalState()

  let cardMinimized = $state(false)

  const startCount = $derived(editor.currentLine?.points.filter((point) => point.type === 'start').length ?? 0)
  const middleCount = $derived(editor.currentLine?.points.filter((point) => point.type === 'middle').length ?? 0)
  const hasTop = $derived(editor.currentLine?.points.some((point) => point.type === 'top') ?? false)

  const selectedPoint = $derived(editor.selectedPoint)

  function togglePointType(mode: 'middle' | 'start' | 'top') {
    editor.pointType = editor.pointType === mode ? undefined : mode
    editor.selectedPointId = undefined
  }
</script>

<!-- Selected-route editing card: overlays the photo strip and slides up like a sheet. -->
<div class="pointer-events-none absolute inset-x-0 bottom-0 z-40 p-3" transition:fly={{ duration: 220, y: 24 }}>
  <div class="preset-filled-surface-50-950 pointer-events-auto mx-auto w-full max-w-md rounded-2xl p-3 shadow-2xl">
    <div class="flex items-center gap-2">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <RouteGrade
          grade={gradeLabel(global.grades, global.gradingScale, route.gradeFk)}
          band={getGradeBand(route.gradeFk)}
        />
        <span class="truncate text-sm font-bold">{route.name || m.topo_quickLine()}</span>
      </div>
      <KbdTooltip label={cardMinimized ? m.common_showMore() : m.common_showLess()}>
        {#snippet trigger(attributes)}
          <button
            {...attributes}
            class="btn-icon preset-filled-surface-200-800"
            aria-label={cardMinimized ? m.common_showMore() : m.common_showLess()}
            onclick={() => (cardMinimized = !cardMinimized)}
          >
            <Icon name="chevron-down" class={cardMinimized ? 'rotate-180' : ''} />
          </button>
        {/snippet}
      </KbdTooltip>
      <button class="btn preset-filled-primary-500" onclick={() => editor.selectRoute(undefined)}>
        {m.topo_done()}
      </button>
    </div>

    {#if !cardMinimized}
      <div class="mt-3 space-y-3" transition:slide={{ duration: 200 }}>
        <div class="flex gap-2">
          <button
            class={[
              'btn grow',
              editor.pointType === 'start' || selectedPoint?.type === 'start'
                ? 'preset-filled-primary-500'
                : 'preset-tonal-surface',
            ]}
            disabled={startCount >= 2}
            onclick={() => togglePointType('start')}
          >
            {m.topo_start()}
            <span class="text-xs font-bold tabular-nums opacity-70">{startCount}/2</span>
          </button>

          <button
            class={[
              'btn grow',
              editor.pointType === 'middle' || selectedPoint?.type === 'middle'
                ? 'preset-filled-primary-500'
                : 'preset-tonal-surface',
            ]}
            onclick={() => togglePointType('middle')}
          >
            {m.topo_middle()}
            <span class="text-xs font-bold tabular-nums opacity-70">{middleCount}</span>
          </button>

          <button
            class={[
              'btn grow',
              editor.pointType === 'top' || selectedPoint?.type === 'top'
                ? 'preset-filled-primary-500'
                : 'preset-tonal-surface',
            ]}
            disabled={hasTop}
            onclick={() => togglePointType('top')}
          >
            {m.topo_top()}
            <span class="text-xs font-bold tabular-nums opacity-70">{hasTop ? 1 : 0}</span>
          </button>

          <button
            class={['btn-icon preset-tonal-error', selectedPoint == null && 'invisible']}
            aria-label={m.topo_deletePoint()}
            onclick={() => selectedPoint != null && editor.deletePoint(selectedPoint.id)}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>

        <div class="preset-tonal-surface flex gap-1 rounded-lg p-1">
          <button
            class={['btn flex-1', editor.currentLine?.topType === 'top' ? 'preset-filled-surface-950-50' : '']}
            onclick={() => editor.setTopType('top')}
          >
            {m.topo_topFinish()}
          </button>
          <button
            class={['btn flex-1', editor.currentLine?.topType === 'topout' ? 'preset-filled-surface-950-50' : '']}
            onclick={() => editor.setTopType('topout')}
          >
            {m.topo_topout()}
          </button>
        </div>

        <button class="btn preset-tonal-error w-full" onclick={() => editor.removeLine(route.id)}>
          {m.topo_removeLine()}
        </button>

        {#if canDelete}
          <button class="btn preset-tonal-error w-full" onclick={onDeleteRoute}>
            <Icon name="trash" size={16} />
            {m.topo_deleteRoute()}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>
