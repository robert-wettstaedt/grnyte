<!--
  The global activity feed: everything logged across the regions the user belongs to.

  Markup and the filter values. `eventFeed()` owns the window, the mark behind the "N new"
  pill, the grouping and the hydration; `EventFeed` renders the cards it decides.
-->
<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import EventFeed from '$lib/components/EventFeed/EventFeed.svelte'
  import EventFilters from '$lib/components/EventFeed/EventFilters.svelte'
  import InstallApp from '$lib/components/InstallApp/InstallApp.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import type { EventCategory } from '$lib/entities/event/dto'
  import { eventFeed } from '$lib/entities/event/feed.svelte'
  import { userList } from '$lib/entities/user/resources.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { syncSearchParams } from '$lib/state/navigation.svelte'

  const global = getGlobalState()

  /** Read once, from the URL, so a reloaded or shared feed opens narrowed the way it was left. */
  const initial = page.url.searchParams
  // Digits only, rather than a `Number()` that is then checked: `Number` also accepts the empty
  // string and whitespace (both 0), `0x10`, `1e3` and `+5`, so anything but a plain id would
  // otherwise become a filter on a region (or person) nobody is, and the feed would go quietly
  // blank. Ids are positive integers, so this is the whole grammar.
  const asNumber = (value: null | string) => (value != null && /^\d+$/.test(value) ? Number(value) : undefined)

  let category = $state<EventCategory | undefined>(
    initial.get('category') === 'ascent' ? 'ascent' : initial.get('category') === 'update' ? 'update' : undefined,
  )
  let regionFk = $state(asNumber(initial.get('region')))
  let userFk = $state(asNumber(initial.get('user')))

  const feed = eventFeed(() => ({ actorFk: userFk, category, regionFk }))

  const regions = $derived(
    global.userRegions.map((membership) => ({
      name: membership.name,
      regionFk: membership.regionFk,
      role: membership.role,
    })),
  )

  /** Every region the user is in: the outer bound on who this page may resolve or offer. */
  const memberRegionFks = $derived(regions.map((region) => region.regionFk))

  /** The picker is the only thing the people list feeds, so it syncs while the picker is up. */
  let filtersOpen = $state(false)

  // Who the feed can be narrowed to: the members of the region in view, or of every region the
  // user belongs to while none is picked. Scoped that way because event rows are region-bound,
  // so offering a member of another region would offer a provably empty feed.
  //
  // ponytail: capped rather than searchable. A region is bounded by `maxMembers`, so the list is
  // small by construction; add the `content` arg (the search screen already passes it) if a
  // community ever outgrows the cap. 51 rather than 50 because the signed-in user is dropped from
  // the page below, and a cap that shrinks by one depending on where their own name happens to
  // sort is not a cap anybody can reason about.
  const people = userList(() => ({ limit: 51, regionFks: regionFk == null ? memberRegionFks : [regionFk] }), {
    enabled: () => filtersOpen,
  })

  /** "Only me" is its own pinned row, so the signed-in user is not also in the list. */
  const others = $derived(people.data.filter((person) => person.id !== global.user?.id))

  // Resolved separately rather than read off `others`: a shared link can carry a person the
  // current region scope excludes, and the chip still has to name them.
  //
  // Through `userList` rather than `usersByIds`: this id comes off the query string, and
  // `usersByIds` resolves any id in the table (it is documented as safe only for ids already
  // embedded in stored content), which would make the chip an id-to-username oracle for the whole
  // user table. Bounded to the regions the viewer is in, walking it reveals only people
  // they already share a community with.
  const selectedPerson = userList(() => ({ ids: userFk == null ? [] : [userFk], regionFks: memberRegionFks }), {
    enabled: () => userFk != null,
  })

  // The one definition of "narrowed" and the one way out of it, for every surface that offers a
  // Reset: the empty state below and the filter sheet's footer. Defined here because this is the
  // only place that holds all three values, and two surfaces under the same label that disagree
  // about which filters count is worse than passing them down.
  const filtered = $derived(category != null || regionFk != null || userFk != null)

  const reset = () => {
    category = undefined
    regionFk = undefined
    userFk = undefined
  }

  // Mirrored rather than driven: the filters are the state, and the URL follows them so a reload
  // or a shared link lands on the same feed. It replaces rather than pushes, so the back button
  // keeps meaning "the page before this one" rather than "the filter before this one", which is
  // what a chip is for.
  $effect(() => {
    syncSearchParams({ category, region: regionFk, user: userFk })
  })
</script>

<svelte:head>
  <title>{m.feed_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="container mx-auto max-w-3xl space-y-4 px-4 py-6 pb-24 md:pb-8">
  <!-- The highest-traffic surface, and the one that gains most from standalone chrome. Renders
       nothing on desktop, once installed, or once the nag policy has retired it. -->
  <InstallApp dismissible offline />

  <EventFilters
    bind:category
    currentUserFk={global.user?.id}
    {filtered}
    onReset={reset}
    bind:open={filtersOpen}
    people={others}
    personName={selectedPerson.data[0]?.username}
    bind:regionFk
    {regions}
    unreadNotifications={global.unreadNotifications}
    bind:userFk
  />

  <QueryState resource={feed.resource}>
    {#snippet ready()}
      <EventFeed
        expandedIds={feed.expandedIds}
        hasMore={feed.hasMore}
        newCount={feed.newCount}
        onLoadOlder={feed.loadOlder}
        onMergeNew={feed.acknowledge}
        views={feed.views}
      />
    {/snippet}

    {#snippet empty()}
      <div class="space-y-1 py-10 text-center">
        <p class="text-surface-950-50 font-semibold">{filtered ? m.feed_emptyFiltered() : m.feed_empty()}</p>

        {#if filtered}
          <button type="button" class="btn preset-tonal-surface mt-3" onclick={reset}>{m.common_reset()}</button>
        {:else}
          <p class="text-surface-600-400 text-sm">{m.feed_emptyBody()}</p>
        {/if}
      </div>
    {/snippet}
  </QueryState>
</div>
