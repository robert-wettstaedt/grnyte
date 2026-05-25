<script lang="ts">
  import { resolve } from '$app/paths'
  import RouteListItem from '$lib/components/RouteListItem'
  import { selectedRouteStore } from '$lib/components/TopoViewer'
  import type { RowWithRelations } from '$lib/db/zero'
  import { getI18n } from '$lib/i18n'
  import { onMount, tick } from 'svelte'
  import { flip } from 'svelte/animate'
  import { slide } from 'svelte/transition'

  interface Props {
    routes: RowWithRelations<'routes', { block: true }>[]
  }

  const { t } = getI18n()

  const { routes }: Props = $props()

  const itemRefs: Record<number, HTMLLIElement> = {}

  onMount(() => {
    return selectedRouteStore.subscribe((id) => {
      if (id != null) {
        tick().then(() => itemRefs[id]?.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'start' }))
      }
    })
  })
</script>

<nav class="list-nav">
  {#if routes.length === 0}
    <div class="card preset-outlined-warning-500 mx-2 flex items-center gap-4 p-4 md:mx-4">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <p class="text-xs opacity-60">
        {t('common.noItemsYet')}
      </p>
    </div>
  {:else}
    <ul class="overflow-auto">
      {#each routes as route (route.id)}
        {@const selected = $selectedRouteStore === route.id}

        <li bind:this={itemRefs[route.id]} animate:flip={{ duration: 200 }}>
          <button
            class={[
              'hover:preset-filled-primary-500 flex w-full items-center justify-between px-2 py-3 text-left text-ellipsis whitespace-nowrap',
              selected ? 'preset-filled-primary-500 rounded-t text-white' : 'rounded',
            ]}
            onclick={() => selectedRouteStore.set(route.id)}
          >
            <RouteListItem {route} showImage={false} />
          </button>

          {#if selected}
            <a
              class="bg-primary-700 flex w-full items-center justify-between rounded-b px-4 py-2 text-sm text-white"
              in:slide
              out:slide
              href={resolve('/(new)/bla/(modal)/routes/[id]', { id: route.id.toString() })}
            >
              {t('common.showEntity', { entity: t('entities.route') })}
              <i class="fa-solid fa-chevron-right text-xs opacity-70"></i>
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</nav>
