<script lang="ts">
  import AscentTypeLabel from '$lib/components/AscentTypeLabel'
  import RouteGrade from '$lib/components/RouteGrade'
  import { config } from '$lib/config'
  import type { Ascent } from '$lib/db/schema'
  import type { RowWithRelations } from '$lib/db/zero'
  import { RatingGroup } from '@skeletonlabs/skeleton-svelte'
  import { pageState } from '$lib/components/Layout'
  import type { InferResultType } from '$lib/db/types'

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

    {#if (route.userRating ?? route.rating) != null}
      <RatingGroup count={3} readOnly value={(route.userRating ?? route.rating)!}>
        <RatingGroup.Control class="gap-0! text-xs md:text-sm">
          <RatingGroup.Context>
            {#snippet children(ratingGroup)}
              {#each ratingGroup().items as index (index)}
                <RatingGroup.Item {index}>
                  {#snippet empty()}
                    <i class="fa-regular fa-star text-warning-500"></i>
                  {/snippet}
                  {#snippet full()}
                    <i class="fa-solid fa-star text-warning-500"></i>
                  {/snippet}
                </RatingGroup.Item>
              {/each}
            {/snippet}
          </RatingGroup.Context>
        </RatingGroup.Control>
        <RatingGroup.HiddenInput />
      </RatingGroup>
    {/if}

    <div class="overflow-hidden text-ellipsis">
      {route.name.length === 0 ? config.routes.defaultName : route.name}
    </div>
  </div>
{/if}
