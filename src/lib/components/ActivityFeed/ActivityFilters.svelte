<!--
  The feed's header: title, the ascent/update segments, the filter sheet's trigger, and a
  removable chip per active filter so a narrowed feed never looks like an empty one.
  Filter values are bindable; the page owns them and mirrors them into the URL.
-->
<script lang="ts">
  import { resolve } from '$app/paths'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { ActivityCategory } from '$lib/entities/activity/dto'
  import { UNREAD_CAP } from '$lib/entities/notification/resources.svelte'
  import type { UserRegion } from '$lib/entities/region/dto'
  import type { UserListItem } from '$lib/entities/user/dto'
  import { m } from '$lib/paraglide/messages'
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte'
  import ActivityFilterSheet from './ActivityFilterSheet.svelte'

  interface Props {
    /** Ascents, other edits, or (undefined) both. */
    category?: ActivityCategory
    /** The signed-in user, the subject of the "Just me" filter. */
    currentUserFk?: number
    /** Whether anything is narrowed, decided by the host: it is the only place that holds every
     *  filter value, and the sheet's Reset and the page's empty-state Reset must agree. */
    filtered?: boolean
    /** Clears every filter, including the ones this component does not render. */
    onReset?: () => void
    /** Bindable so the host can sync the people list only while the picker is up. */
    open?: boolean
    /** The people who can be filtered to, already scoped and without the signed-in user. */
    people?: UserListItem[]
    /** Name of the selected actor, resolved by the host so a reloaded `?user=` still reads out
     *  even when that person is outside the region the picker is currently scoped to. */
    personName?: string
    /** Selected region, or `undefined` for all of them. */
    regionFk?: number
    /** The user's regions. The design hides the region controls for a single-region user,
     *  who has nothing to narrow to. */
    regions?: Pick<UserRegion, 'name' | 'regionFk' | 'role'>[]
    /** Unread directed notifications. `0` renders the bell without a count. */
    unreadNotifications?: number
    /** Selected actor, or `undefined` for everyone. */
    userFk?: number
  }

  let {
    category = $bindable(),
    currentUserFk,
    filtered = false,
    onReset,
    open = $bindable(false),
    people = [],
    personName,
    regionFk = $bindable(),
    regions = [],
    unreadNotifications = 0,
    userFk = $bindable(),
  }: Props = $props()

  // Past the cap the number stops being information. The bell is also the only place that shows
  // an exact count: the tab dot next to it is deliberately a dot, because two counts on one
  // screen are an invitation to disagree.
  const unreadLabel = $derived(unreadNotifications > UNREAD_CAP ? `${UNREAD_CAP}+` : String(unreadNotifications))

  // The control needs a value for "no category", which the filter itself expresses as
  // `undefined`; `all` is that value, and never leaves this component.
  const segment = $derived(category ?? 'all')

  const regionName = $derived(regions.find((region) => region.regionFk === regionFk)?.name)

  // The header says what the feed is scoped to only while nothing is picked. Once a region is,
  // the chip below is the readout, and it is the one that can be tapped away; printing the name
  // in both places says it twice.
  const scopeLabel = $derived(regions.length > 1 && regionFk == null ? m.feed_allRegions() : undefined)
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

    {#if scopeLabel != null}
      <span class="text-surface-600-400 truncate text-xs font-semibold">{scopeLabel}</span>
    {/if}

    <!-- Same size and same preset as the filter trigger beside it: they are two tools of equal
         rank in one header, and the badge is the only thing here that should draw an eye. -->
    <a
      class="btn-icon preset-tonal-surface relative flex-none"
      href={resolve('/(app)/notifications')}
      aria-label={unreadNotifications > 0
        ? `${m.notifications_title()} - ${m.notifications_unread({ count: unreadNotifications })}`
        : m.notifications_title()}
    >
      <Icon name="bell" size={18} />

      {#if unreadNotifications > 0}
        <span
          class="preset-filled-primary-500 absolute -inset-e-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold"
          aria-hidden="true"
        >
          {unreadLabel}
        </span>
      {/if}
    </a>

    <ActivityFilterSheet {currentUserFk} {filtered} {onReset} bind:open {people} bind:regionFk {regions} bind:userFk />
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
        {@render chip(
          userFk === currentUserFk ? m.feed_justMe() : (personName ?? m.feed_person()),
          () => (userFk = undefined),
        )}
      {/if}
    </div>
  {/if}
</div>
