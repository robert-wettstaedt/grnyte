<script lang="ts" module>
  import type { Snippet } from 'svelte'
  import type { RouteListItem } from './dto'

  export interface SimilarAction {
    /** Given the route and a way to close the preview. */
    action: Snippet<[RouteListItem, () => void]>
    /** Whether `action` applies to this route. The preview offers nothing where it does not. */
    offers: (route: RouteListItem) => boolean
  }
</script>

<script lang="ts">
  import { resolve } from '$app/paths'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import Topo from '$lib/components/Topo/Topo.svelte'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { motion } from '$lib/state/motion.svelte'
  import { flip } from 'svelte/animate'
  import { slide } from 'svelte/transition'
  import RouteGrade from './RouteGrade.svelte'
  import RouteRating from './RouteRating.svelte'
  import RouteTags from './RouteTags.svelte'
  import { similarRoutes } from './similarMatches.svelte'

  interface Props {
    block: { areaFk: number; id: number; regionFk: number }
    /** Whether the name field has focus: the list only changes while it does. */
    focused: boolean
    name: string
    /** What the preview offers in place of the route's link. */
    similar?: SimilarAction
  }

  const { block, focused, name, similar }: Props = $props()

  const global = getGlobalState()
  const list = similarRoutes({ block: () => block, focused: () => focused, name: () => name })

  const duration = $derived(motion(150))
  const exact = $derived(list.rows[0]?.kind === 'exact' && list.rows[0].place === 'block' ? list.rows[0].route : null)

  let previewed = $state<RouteListItem>()
  let previewOpen = $state(false)

  const grade = (route: RouteListItem) => gradeLabel(global.grades, global.gradingScale, route.gradeFk)
  const crumbs = (route: RouteListItem) => [route.areaName, route.blockName].filter((crumb) => crumb != null)

  const topo = $derived(
    previewed?.topoImagePath != null && previewed.topoPoints != null && previewed.topoPoints.length > 0
      ? { path: previewed.topoImagePath, points: previewed.topoPoints }
      : null,
  )
  const hasDescription = $derived(previewed != null && previewed.description.trim() !== '')
  const tall = $derived(topo != null || hasDescription)
  const offered = $derived(previewed != null && (similar?.offers(previewed) ?? true))

  function preview(route: RouteListItem) {
    previewed = route
    previewOpen = true
  }
</script>

<div class="sr-only" role="status">
  {#if exact != null}
    {m.routes_form_similarExact({ name: exact.name })}
  {:else if list.rows.length > 0}
    {m.routes_form_similarAnnouncement()}
  {/if}
</div>

{#if list.rows.length > 0}
  <section class="space-y-2" transition:slide={{ duration }}>
    {#if exact != null}
      <p class="flex items-start gap-2 text-sm font-semibold" aria-hidden="true">
        <span class="mt-1 flex-none"><Icon name="info" size={14} /></span>
        {m.routes_form_similarExact({ name: exact.name })}
      </p>
    {:else}
      <p class="text-surface-700-300 text-sm font-semibold">{m.routes_form_similarHeading()}</p>
    {/if}

    <div class="border-surface-200-800 bg-surface-100-900 overflow-hidden rounded-xl border">
      {#each list.rows as { route } (route.id)}
        <div animate:flip={{ duration }} transition:slide={{ duration }}>
          <RouteRow
            crumbs={crumbs(route)}
            grade={grade(route)}
            onclick={() => preview(route)}
            route={{ ...route, description: '' }}
            variant="option"
          />
        </div>
      {/each}
    </div>
  </section>
{/if}

<Modal
  backdrop
  bind:open={previewOpen}
  contentClass="w-md max-h-[80dvh]"
  footer={tall && offered ? footer : undefined}
  panel
  panelClass="fixed inset-0 z-60 flex items-center justify-center p-4"
  subtitle={previewed == null ? undefined : crumbs(previewed).join(' · ')}
  title={previewed?.name ?? ''}
>
  {#if previewed != null}
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RouteGrade band={getGradeBand(previewed.gradeFk ?? null)} grade={grade(previewed)} />
        <RouteRating rating={previewed.rating} />
        {#if previewed.firstAscentYear != null}
          <span class="text-surface-600-400 text-sm">
            {m.routes_form_faLabel()}
            <span class="font-mono font-bold">{previewed.firstAscentYear}</span>
          </span>
        {/if}
      </div>

      {#if topo != null}
        <Topo
          alt={m.topo_alt()}
          class="max-h-56 w-full"
          height={previewed.topoImageHeight}
          highlightId={previewed.id}
          imagePath={topo.path}
          lines={[{ band: getGradeBand(previewed.gradeFk ?? null), id: previewed.id, points: topo.points }]}
          linesWithoutPhoto
          width={previewed.topoImageWidth}
        />
      {/if}

      <RouteTags tags={previewed.tags} />

      {#if hasDescription}
        <section class="flex flex-col gap-2">
          <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">
            {m.routes_form_descriptionLabel()}
          </h2>
          <Markdown markdown={previewed.description} />
        </section>
      {/if}

      {#if !tall && offered}
        <div class="pb-2">{@render footer()}</div>
      {/if}
    </div>
  {/if}
</Modal>

<!-- Pinned only under a topo or description, which can push it below the half-height phone sheet's fold.
     Pinned under a short preview it would sit at the sheet's bottom with a gap above it. -->
{#snippet footer()}
  {#if previewed != null}
    {#if similar}
      {@render similar.action(previewed, () => (previewOpen = false))}
    {:else}
      <a
        class="btn preset-filled-primary-500 w-full"
        href={resolve('/(app)/routes/[id]', { id: String(previewed.id) })}
      >
        {m.routes_showDetails()}
      </a>
    {/if}
  {/if}
{/snippet}
