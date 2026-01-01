<script lang="ts">
  import AscentTypeLabel from '$lib/components/AscentTypeLabel'
  import { pageState } from '$lib/components/Layout'
  import RouteGrade from '$lib/components/RouteGrade'
  import { config } from '$lib/config'
  import type { Ascent } from '$lib/db/schema'
  import type { InferResultType } from '$lib/db/types'
  import type { RowWithRelations } from '$lib/db/zero'
  import RouteRating from '../RouteRating'

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
      <svelte:boundary>
        {#snippet failed()}
          <!--
            even though we check for null, it can happen that lastAscent.type is null
            must be a bug of zero-svelte
          -->
        {/snippet}

        <AscentTypeLabel includeText={false} type={lastAscent.type} />
      </svelte:boundary>
    {/if}

    <RouteGrade {route} ascents={route.ascents} />

    <RouteRating value={route.userRating ?? route.rating} />

    <div class="overflow-hidden text-ellipsis">
      {route.name.length === 0 ? config.routes.defaultName : route.name}
    </div>
  </div>
{/if}
