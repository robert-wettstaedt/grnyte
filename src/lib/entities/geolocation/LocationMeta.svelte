<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { MediaQuery } from 'svelte/reactivity'
  import { slide } from 'svelte/transition'

  /**
   * Where an entity is, in one line: distance once a fix arrives, or why there is none. Given an
   * `href` it is also the repair affordance, which keeps a status out of the action row's one slot.
   */
  interface Props {
    /** Live distance, absent until the first GPS fix. */
    distance?: string | undefined
    /** Where to fix the pin, for a viewer who may. */
    href?: string | undefined
    isHere?: boolean
    pin: 'estimated' | 'missing' | 'set'
  }

  const { distance, href, isHere = false, pin }: Props = $props()

  const shown = $derived(pin !== 'set' || isHere || distance != null)

  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current ? 0 : 150)

  const line = 'text-surface-600-400 flex items-center gap-1.5 text-[11px] font-semibold tabular-nums'
</script>

{#snippet body()}
  {#if pin === 'missing'}
    <Icon name="alert-triangle" size={14} class="text-warning-500 shrink-0" />
    <span>{m.blocks_noLocation()}</span>
  {:else}
    {#if pin === 'estimated'}
      <Icon name="map-pin-search" size={14} class="text-warning-500 shrink-0" />
      <span>{m.blocks_estimatedLocation()}</span>
    {/if}

    {#if isHere}
      <span class="flex items-center gap-1">
        {#if pin !== 'estimated'}
          <Icon name="map-pin" size={12} class="shrink-0" />
        {/if}
        {m.areas_youAreHere()}
      </span>
    {:else if distance != null}
      <span class="flex items-center gap-1">
        {#if pin !== 'estimated'}
          <Icon name="map-pin" size={12} class="shrink-0" />
        {/if}
        {m.areas_distanceAway({ distance })}
      </span>
    {/if}
  {/if}

  {#if href != null}
    <Icon name="chevron-right" size={12} class="shrink-0" />
  {/if}
{/snippet}

{#if shown}
  <div class="mb-2" transition:slide={{ duration }}>
    {#if href != null}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller resolves it -->
      <a class={[line, 'hover:text-surface-950-50 w-fit transition-colors']} {href}>
        {@render body()}
      </a>
    {:else}
      <div class={line}>
        {@render body()}
      </div>
    {/if}
  </div>
{/if}
