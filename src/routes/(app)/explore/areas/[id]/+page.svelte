<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaDetail, areaList } from '$lib/entities/area'
  import { m } from '$lib/paraglide/messages.js'

  // Getters keep the resources live across client-side navigation between
  // areas — the underlying queries re-target when the param changes.
  const area = areaDetail(() => Number(page.params.id))
  const subAreas = areaList(() => ({ parentFk: Number(page.params.id) }))
</script>

<svelte:head>
  <title>{area.data?.name ?? m.areas_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="container mx-auto max-w-3xl space-y-6 px-4 py-8 pb-24 md:pb-8">
  <QueryState resource={area}>
    {#snippet ready(detail)}
      <header class="space-y-2">
        <nav class="text-surface-600-400 text-sm">
          <a href={resolve('/areas')} class="anchor">{m.areas_title()}</a>
          {#each detail.ancestors as ancestor (ancestor.id)}
            / <a href={resolve('/(app)/areas/[id]', { id: String(ancestor.id) })} class="anchor">{ancestor.name}</a>
          {/each}
        </nav>
        <div class="flex items-center gap-3">
          <h1 class="h1">{detail.name}</h1>
          <span class="badge preset-tonal capitalize">{detail.type}</span>
        </div>
        {#if detail.authorName != null || detail.createdAt != null}
          <p class="text-surface-600-400 text-sm">
            {#if detail.authorName != null}
              {m.area_createdBy({ username: detail.authorName })}
            {/if}
            {#if detail.createdAt != null}
              · {detail.createdAt.toLocaleDateString()}
            {/if}
          </p>
        {/if}
      </header>

      {#if detail.description != null}
        <p>{detail.description}</p>
      {/if}

      {#if detail.parkingLocations.length > 0}
        <section class="space-y-2">
          <h2 class="h3">{m.area_parkingLocations()}</h2>
          <ul class="list-inside list-disc">
            {#each detail.parkingLocations as parking (parking.id)}
              <li class="font-mono text-sm">{parking.lat}, {parking.long}</li>
            {/each}
          </ul>
        </section>
      {/if}

      <section class="space-y-2">
        <h2 class="h3">{m.area_subAreas()}</h2>
        <QueryState resource={subAreas}>
          {#snippet ready(items)}
            <nav class="card preset-outlined-surface-200-800 divide-surface-200-800 divide-y">
              {#each items as subArea (subArea.id)}
                <a
                  href={resolve('/(app)/areas/[id]', { id: String(subArea.id) })}
                  class="hover:preset-tonal flex items-center justify-between gap-4 px-4 py-3"
                >
                  {subArea.name}
                  <span class="badge preset-tonal capitalize">{subArea.type}</span>
                </a>
              {/each}
            </nav>
          {/snippet}
        </QueryState>
      </section>
    {/snippet}
    {#snippet empty()}
      <p class="text-surface-600-400 py-8 text-center">
        {m.area_notFound()}
        <a href={resolve('/areas')} class="anchor">{m.areas_title()}</a>
      </p>
    {/snippet}
  </QueryState>
</div>
