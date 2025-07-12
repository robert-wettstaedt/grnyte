<script lang="ts">
  import { page } from '$app/state'
  import AscentTypeLabel from '$lib/components/AscentTypeLabel'
  import RouteGrade from '$lib/components/RouteGrade'
  import { config } from '$lib/config'
  import type { Ascent } from '$lib/db/schema'
  import type { RowWithRelations, Schema } from '$lib/db/zero'
  import { Rating } from '@skeletonlabs/skeleton-svelte'
  import { Query } from 'zero-svelte'

  interface Props {
    classes?: string
    route: RowWithRelations<'routes', Schema, { ascents: true }>
  }

  let { classes, route }: Props = $props()

  const { current: ascents } = $derived(
    new Query(page.data.z.current.query.ascents.where('routeFk', route.id!).where('createdBy', page.data.user?.id!)),
  )

  const lastAscent = $derived.by(() => {
    if (page.data.user == null) {
      return null
    }

    const routeAscents = route.ascents ?? ascents ?? []
    const ascentsByUser = routeAscents.filter((ascent) => String(ascent.createdBy) === String(page.data.user!.id))

    const priorityAscents: Ascent['type'][] = ['repeat', 'flash', 'send', 'attempt']

    for (const type of priorityAscents) {
      const ascent = ascentsByUser.find((ascent) => ascent.type === type)
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

    <RouteGrade {route} />

    {#if (route.userRating ?? route.rating) != null}
      <div>
        <Rating
          controlClasses="!gap-0 text-xs md:text-sm"
          count={3}
          readOnly
          value={(route.userRating ?? route.rating)!}
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
