<script lang="ts">
  import { resolve } from '$app/paths'
  import Row from '$lib/components/EntityRow/Row.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { areaList } from '$lib/entities/area/resources.svelte'
  import { routeList } from '$lib/entities/route/resources.svelte'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** The entity being referenced — we search descriptions for its `!type:id!` token. */
    type: 'areas' | 'blocks' | 'routes'
    id: number
  }

  const { type, id }: Props = $props()

  // The portable reference token the markdown editor stores; its `!` delimiters keep the
  // match exact (`!blocks:42!` ≠ `!blocks:421!`).
  const token = $derived(`!${type}:${id}!`)

  // Backlink sources: any area or route description that mentions this entity. Routes have
  // no detail page of their own, so they link to the block they belong to.
  const areas = areaList(() => ({ references: token }))
  const routes = routeList(() => ({ references: token }))
  // TODO: ascents

  const count = $derived(areas.data.length + routes.data.length)
</script>

{#if count > 0}
  <section class="space-y-2">
    <h2 class="text-surface-600-400 text-sm font-bold tracking-wider uppercase">{m.reference_referencedBy()}</h2>

    <div class="flex flex-col gap-1.5">
      {#each areas.data as area (area.id)}
        <Row
          title={area.name}
          href={resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(area.id) })}
          {rightContent}
        >
          {@render iconTile('area')}
        </Row>
      {/each}

      {#each routes.data as route (route.id)}
        <Row
          title={route.name}
          // TODO: route detail page
          href={resolve('/(app)/(shell)/(map)/blocks/[id]', { id: String(route.blockFk) })}
          {rightContent}
        >
          {@render iconTile('route')}
        </Row>
      {/each}
    </div>
  </section>
{/if}

{#snippet iconTile(name: 'area' | 'route')}
  <span class="bg-primary-500/15 text-primary-500 flex size-10 flex-none items-center justify-center rounded-xl">
    <Icon {name} size={18} />
  </span>
{/snippet}

{#snippet rightContent()}
  <Icon name="chevron-right" size={17} class="text-surface-500 shrink-0" />
{/snippet}
