<script lang="ts">
  import { resolve } from '$app/paths'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import type { UserRegion } from '$lib/entities/region/dto'

  interface Props {
    /** The area whose location trail is shown. */
    area: AreaDetail
    /** The signed-in user's memberships — names the region only when there's more than one. */
    userRegions: UserRegion[]
    /** Append `area` itself as the final crumb (e.g. when it's the parent of a new child). */
    includeSelf?: boolean
  }

  let { area, userRegions, includeSelf = false }: Props = $props()

  // Deep hierarchies make the breadcrumb unreadable, so keep only the two crumbs
  // nearest the current area; anything above collapses to an ellipsis.
  const maxAncestors = 2

  // Only worth naming the region when the user belongs to more than one — with a
  // single region it's implied and would just be noise in the breadcrumb.
  const regionName = $derived.by(() => {
    if (userRegions.length <= 1) {
      return null
    }
    return userRegions.find((region) => region.regionFk === area.regionFk)?.name ?? null
  })

  // When `includeSelf`, the area joins its own ancestors as the final crumb so the
  // trail reads the whole path down to (and including) it.
  const crumbs = $derived(includeSelf ? [...area.areas, { id: area.id, name: area.name }] : area.areas)
  const visible = $derived(crumbs.slice(-maxAncestors))
</script>

{#if regionName != null || crumbs.length > 0}
  <!-- Keep the trail on a single line and let it scroll instead of wrapping; the
       scrollbar is hidden so it reads as a clean subtitle. -->
  <div class="breadcrumb flex items-center gap-2 overflow-x-auto whitespace-nowrap">
    {#if regionName != null}
      <span class="text-surface-600-400 shrink-0 text-xs">{regionName}</span>

      {#if visible.length > 0}
        <span class="shrink-0 text-xs">·</span>
      {/if}
    {/if}

    {#if crumbs.length > visible.length}
      <span class="text-surface-600-400 shrink-0 text-xs">…</span>
      <span class="shrink-0 text-xs">·</span>
    {/if}

    {#each visible as crumb, index (crumb.id)}
      <a class="anchor shrink-0 text-xs" href={resolve('/(app)/(shell)/(map)/areas/[id]', { id: crumb.id.toString() })}>
        {crumb.name}
      </a>

      {#if index < visible.length - 1}
        <span class="shrink-0 text-xs">·</span>
      {/if}
    {/each}
  </div>
{/if}

<style>
  /* Hide the horizontal scrollbar so the overflowing breadcrumb still reads as a
     plain subtitle line. */
  .breadcrumb {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .breadcrumb::-webkit-scrollbar {
    display: none;
  }
</style>
