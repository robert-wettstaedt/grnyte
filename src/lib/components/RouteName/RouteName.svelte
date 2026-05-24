<script lang="ts">
  import AscentTypeLabel from '$lib/components/AscentTypeLabel'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import RouteGrade from '$lib/components/RouteGrade'
  import RouteRating from '$lib/components/RouteRating'
  import { config } from '$lib/config'
  import type { Ascent } from '$lib/db/schema'
  import type { InferResultType } from '$lib/db/types'
  import type { RowWithRelations } from '$lib/db/zero'

  type RouteWithAscents = InferResultType<'routes', { ascents: true }>

  interface Props {
    classes?: string
    route:
      | RowWithRelations<'routes', { ascents: true }>
      | (Omit<RouteWithAscents, 'ascents'> & Partial<Pick<RouteWithAscents, 'ascents'>>)
  }

  let { classes, route }: Props = $props()

  const lastAscent = $derived.by(() => {
    if (route?.ascents == null || pageState.user == null) {
      return null
    }

    const ascents = route.ascents.filter((ascent) => String(ascent.createdBy) === String(pageState.user!.id))

    const priorityAscents: Ascent['type'][] = ['repeat', 'flash', 'send', 'attempt']

    for (const type of priorityAscents) {
      const ascent = ascents.find((ascent) => ascent.type === type)
      if (ascent != null) {
        return ascent
      }
    }
  })
</script>

{#if route != null}
  <div class="flex items-center gap-x-1 md:gap-x-2 {classes}">
    {#if lastAscent != null}
      <AscentTypeLabel includeText={false} type={lastAscent.type} />
    {/if}

    <RouteGrade {route} ascents={route.ascents} />

    <RouteRating value={route.userRating ?? route.rating} />

    <div class="overflow-hidden text-ellipsis">
      {route.name.length === 0 ? config.routes.defaultName : route.name}
    </div>
  </div>
{/if}
