<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaDetail, areaList } from '$lib/entities/area/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { sheetState } from '../../Modal/sheetState.svelte'

  // Getters keep the resources live across navigation between areas (e.g. when
  // tapping a sub-area) — the underlying queries re-target as the param changes.
  const area = areaDetail(() => Number(page.params.id))
  const subAreas = areaList(() => ({ parentFk: Number(page.params.id) }))

  // The shared Modal renders its header from sheetState, so feed it the title.
  $effect(() => {
    sheetState.title = area.data?.name ?? ''
  })
</script>

<QueryState resource={area}>
  {#snippet ready(detail)}
    <div class="space-y-5">
      {#if detail.description != null}
        <p class="leading-relaxed">{detail.description}</p>
      {/if}

      <div class="flex gap-2">
        {@render stat(String(subAreas.data?.length ?? 0), m.area_subAreas())}
        {@render stat(String(detail.parkingLocations.length), m.area_parkingLocations())}
        {@render stat(detail.type, m.area_type())}
      </div>

      {#if subAreas.data != null && subAreas.data.length > 0}
        <section class="space-y-2">
          <h2 class="text-surface-600-400 text-sm font-bold tracking-wider uppercase">{m.area_subAreas()}</h2>
          <nav class="flex flex-col gap-2">
            {#each subAreas.data as subArea (subArea.id)}
              <a
                href={resolve('/(app)/(map)/areas/[id]', { id: String(subArea.id) })}
                class="border-surface-300-700 bg-surface-200-800 hover:bg-surface-300-700 flex items-center gap-3 rounded-xl border p-2.5"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">{subArea.name}</span>
                  <span class="text-surface-600-400 block text-xs capitalize">{subArea.type}</span>
                </span>
                <Icon name="chevron-right" size={18} class="text-surface-500 flex-none" />
              </a>
            {/each}
          </nav>
        </section>
      {/if}
    </div>
  {/snippet}

  {#snippet empty()}
    <p class="text-surface-600-400 py-8 text-center">{m.area_notFound()}</p>
  {/snippet}
</QueryState>

{#snippet stat(value: string, label: string)}
  <div class="bg-surface-200-800 flex-1 rounded-xl p-3">
    <p class="text-xl font-bold tracking-tight capitalize">{value}</p>
    <p class="text-surface-600-400 text-xs font-semibold tracking-wide uppercase">{label}</p>
  </div>
{/snippet}
