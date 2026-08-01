<!--
  The feed's header: title, the ascent/update segments, the filter sheet's trigger, and a
  removable chip per active filter so a narrowed feed never looks like an empty one.
  Filter values are bindable; the page owns them and mirrors them into the URL.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { ActivityCategory } from '$lib/entities/activity/dto'
  import type { UserRegion } from '$lib/entities/region/dto'
  import { m } from '$lib/paraglide/messages'
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte'
  import ActivityFilterSheet from './ActivityFilterSheet.svelte'

  interface Props {
    /** Ascents, other edits, or (undefined) both. */
    category?: ActivityCategory
    /** The signed-in user, the subject of the "Just me" filter. */
    currentUserFk?: number
    /** Selected region, or `undefined` for all of them. */
    regionFk?: number
    /** The user's regions. The design hides the region controls for a single-region user,
     *  who has nothing to narrow to. */
    regions?: Pick<UserRegion, 'name' | 'regionFk'>[]
    /** Selected actor, or `undefined` for everyone. */
    userFk?: number
  }

  let {
    category = $bindable(),
    currentUserFk,
    regionFk = $bindable(),
    regions = [],
    userFk = $bindable(),
  }: Props = $props()

  // The control needs a value for "no category", which the filter itself expresses as
  // `undefined`; `all` is that value, and never leaves this component.
  const segment = $derived(category ?? 'all')

  const regionName = $derived(regions.find((region) => region.regionFk === regionFk)?.name)
</script>

{#snippet chip(label: string, clear: () => void)}
  <button
    type="button"
    class="preset-tonal-primary flex items-center gap-1 rounded-full py-1 ps-3 pe-2 text-xs font-semibold"
    onclick={clear}
  >
    {label}
    <Icon name="close" size={13} />
  </button>
{/snippet}

<div class="space-y-2.5">
  <div class="flex items-center gap-2">
    <h1 class="text-surface-950-50 flex-1 text-2xl font-bold tracking-tight">{m.feed_title()}</h1>

    {#if regions.length > 1}
      <span class="text-surface-600-400 truncate text-xs font-semibold">{regionName ?? m.feed_allRegions()}</span>
    {/if}

    <ActivityFilterSheet {currentUserFk} bind:regionFk bind:userFk {regions} />
  </div>

  <SegmentedControl
    value={segment}
    onValueChange={(details) => (category = details.value === 'all' ? undefined : (details.value as ActivityCategory))}
  >
    <SegmentedControl.Control class="w-full">
      <SegmentedControl.Indicator class="preset-filled-primary-500" />
      {#each [{ label: m.feed_segmentAll(), value: 'all' }, { label: m.feed_segmentAscents(), value: 'ascent' }, { label: m.feed_segmentUpdates(), value: 'update' }] as option (option.value)}
        <SegmentedControl.Item value={option.value}>
          <SegmentedControl.ItemText class="data-[state=checked]:text-primary-contrast-500">
            {option.label}
          </SegmentedControl.ItemText>
          <SegmentedControl.ItemHiddenInput />
        </SegmentedControl.Item>
      {/each}
    </SegmentedControl.Control>
  </SegmentedControl>

  {#if regionFk != null || userFk != null}
    <div class="flex flex-wrap gap-1.5">
      {#if regionName != null}
        {@render chip(regionName, () => (regionFk = undefined))}
      {/if}
      {#if userFk != null}
        {@render chip(userFk === currentUserFk ? m.feed_justMe() : m.feed_person(), () => (userFk = undefined))}
      {/if}
    </div>
  {/if}
</div>
