<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaList } from '$lib/entities/area'
  import { m } from '$lib/paraglide/messages'

  const areas = areaList()
</script>

<svelte:head>
  <title>{m.areas_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="container mx-auto max-w-3xl space-y-6 px-4 py-8 pb-24 md:pb-8">
  <h1 class="h1">{m.areas_title()}</h1>

  <QueryState resource={areas}>
    {#snippet ready(items)}
      <nav class="card preset-outlined-surface-200-800 divide-surface-200-800 divide-y">
        {#each items as area (area.id)}
          <a
            href={resolve('/(app)/areas/[id]', { id: String(area.id) })}
            class="hover:preset-tonal flex items-center justify-between gap-4 px-4 py-3"
          >
            <span>
              {#if area.ancestors.length > 0}
                <span class="text-surface-600-400 text-sm">
                  {area.ancestors.map((ancestor) => ancestor.name).join(' / ')} /
                </span>
              {/if}
              {area.name}
            </span>
            <span class="badge preset-tonal capitalize">{area.type}</span>
          </a>
        {/each}
      </nav>
    {/snippet}
  </QueryState>
</div>
