<script lang="ts">
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaDetail, areaList } from '$lib/entities/area/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { BottomSheet } from 'svelte-bottom-sheet'
  import { MediaQuery } from 'svelte/reactivity'

  const { areaId, onClose }: { areaId: number; onClose: () => void } = $props()

  // Same breakpoint as Tailwind's `md`: bottom sheet below, sidebar overlay above.
  const desktop = new MediaQuery('(min-width: 48rem)')

  const area = areaDetail(() => areaId)
  const subAreas = areaList(() => ({ parentFk: areaId }))

  const subtitle = $derived(area.data?.areas.map((ancestor) => ancestor.name).join(' · ') ?? '')

  function onKeydown(event: KeyboardEvent) {
    // The sheet handles Escape itself; the sidebar needs it wired up manually.
    if (desktop.current && event.key === 'Escape') onClose()
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet header()}
  <div class="flex min-h-10 items-center gap-2.5">
    <div class="min-w-0 flex-1">
      <p class="truncate text-lg font-bold tracking-tight">{area.data?.name ?? '…'}</p>
      {#if subtitle !== ''}
        <p class="text-surface-600-400 truncate text-[0.8125rem] font-medium">{subtitle}</p>
      {/if}
    </div>
    <button
      type="button"
      onclick={onClose}
      class="bg-surface-200-800 hover:bg-surface-300-700 flex size-10 flex-none items-center justify-center rounded-xl"
      aria-label={m.common_close()}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
{/snippet}

{#snippet stat(value: string, label: string)}
  <div class="bg-surface-200-800 flex-1 rounded-[14px] p-3">
    <p class="text-xl font-bold tracking-tight capitalize">{value}</p>
    <p class="text-surface-600-400 text-[0.6875rem] font-semibold tracking-wide uppercase">{label}</p>
  </div>
{/snippet}

{#snippet body()}
  <QueryState resource={area}>
    {#snippet ready(detail)}
      <div class="space-y-5 p-4">
        {#if detail.description != null}
          <p class="text-[0.9375rem] leading-relaxed">{detail.description}</p>
        {/if}

        <div class="flex gap-2">
          {@render stat(String(subAreas.data?.length ?? 0), m.area_subAreas())}
          {@render stat(String(detail.parkingLocations.length), m.area_parkingLocations())}
          {@render stat(detail.type, m.area_type())}
        </div>

        <section class="space-y-2.5">
          <h3 class="text-surface-600-400 text-[0.8125rem] font-bold tracking-wider uppercase">
            {m.area_subAreas()}
          </h3>
          <QueryState resource={subAreas}>
            {#snippet ready(items)}
              <div class="flex flex-col gap-2">
                {#each items as subArea (subArea.id)}
                  <a
                    href="?area={subArea.id}"
                    class="border-surface-300-700 bg-surface-200-800 hover:bg-surface-300-700 flex items-center gap-3 rounded-[14px] border p-2.5"
                  >
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[0.9375rem] font-semibold">{subArea.name}</span>
                      <span class="text-surface-600-400 block text-xs capitalize">{subArea.type}</span>
                    </span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="text-surface-500 flex-none"
                      aria-hidden="true"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </a>
                {/each}
              </div>
            {/snippet}
          </QueryState>
        </section>

        {#if detail.parkingLocations.length > 0}
          <section class="space-y-2.5">
            <h3 class="text-surface-600-400 text-[0.8125rem] font-bold tracking-wider uppercase">
              {m.area_parkingLocations()}
            </h3>
            <ul class="space-y-1">
              {#each detail.parkingLocations as parking (parking.id)}
                <li class="font-mono text-sm">{parking.lat}, {parking.long}</li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>
    {/snippet}
  </QueryState>
{/snippet}

{#if desktop.current}
  <aside
    class="bg-surface-100-900 absolute inset-y-4 left-4 z-20 flex w-99 max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-[18px] shadow-2xl"
  >
    <div class="border-surface-300-700 border-b p-4">
      {@render header()}
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      {@render body()}
    </div>
  </aside>
{:else}
  <BottomSheet
    bind:isSheetOpen={() => true, (open) => !open && onClose()}
    settings={{ maxHeight: 0.85, snapPoints: [0.28, 0.58, 1], startingSnapPoint: 0.28 }}
  >
    <BottomSheet.Sheet class="area-sheet">
      <BottomSheet.Handle class="area-sheet-handle">
        <div class="w-full px-3 pb-1">
          <div class="bg-surface-400-600 mx-auto mb-3 h-1.25 w-9.5 rounded-full"></div>
          {@render header()}
        </div>
      </BottomSheet.Handle>
      <BottomSheet.Content class="area-sheet-content">
        {@render body()}
      </BottomSheet.Content>
    </BottomSheet.Sheet>
  </BottomSheet>
{/if}
