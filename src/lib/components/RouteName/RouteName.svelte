<script lang="ts">
  import { page } from '$app/state'
  import AscentTypeLabel from '$lib/components/AscentTypeLabel'
  import RouteGrade from '$lib/components/RouteGrade'
  import { config } from '$lib/config'
  import type { Ascent } from '$lib/db/schema'
  import type { InferResultType } from '$lib/db/types'
  import { Rating } from '@skeletonlabs/skeleton-svelte'

  type RouteWithAscents = InferResultType<'routes', { ascents: true }>

  interface Props {
    classes?: string
    route: (Omit<RouteWithAscents, 'ascents'> & Partial<Pick<RouteWithAscents, 'ascents'>>) | undefined
  }

  let { classes, route }: Props = $props()

  const lastAscent = $derived.by(() => {
    if (route?.ascents == null || page.data.user == null) {
      return null
    }

    const ascents = route.ascents.filter((ascent) => String(ascent.createdBy) === String(page.data.user!.id))

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
  <div class="flex gap-x-1 md:gap-x-2 items-center {classes}">
    {#if lastAscent != null}
      <AscentTypeLabel includeText={false} type={lastAscent.type} />
    {/if}

    <RouteGrade {route} />

    {#if (route.userRating ?? route.rating) != null}
      <div>
        <Rating
          count={3}
          readOnly
          value={(route.userRating ?? route.rating)!}
          controlClasses="!gap-0 text-xs md:text-sm"
        >
          {#snippet iconFull()}
            <i class="fa-solid fa-star text-warning-500"></i>
          {/snippet}

          {#snippet iconEmpty()}
            <i class="fa-regular fa-star"></i>
          {/snippet}
        </Rating>
      </div>
    {/if}

    <div class="overflow-hidden text-ellipsis">
      {route.name.length === 0 ? config.routes.defaultName : route.name}
    </div>
  </div>
{/if}
