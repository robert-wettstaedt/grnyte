<!--
  The feed's filter surface: a mobile sheet, a right-hand aside on desktop (Modal picks).
  Region and person only; the ascent/update split stays on the segmented control, where it
  is one tap. Choices apply as they are made, so there is no Apply button to forget.

  Presentational: the people come in as a prop, so the host owns the query and the stories can
  render this without a Zero client. So do `filtered` and `onReset`: the host is the only place
  that holds every filter, including the category this sheet does not render, and the Reset here
  and the one in the feed's empty state carry the same label and must mean the same thing.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { UserRegion } from '$lib/entities/region/dto'
  import { roleLabel } from '$lib/entities/rolePermission/mapper'
  import type { UserListItem } from '$lib/entities/user/dto'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** The signed-in user, the subject of "Only me". */
    currentUserFk?: number
    /** Whether anything is narrowed, decided by the host, which is the only place that holds
     *  every filter value (the category lives on the segmented control, not in here). */
    filtered?: boolean
    /** Clears every filter, including the ones this sheet does not render. */
    onReset?: () => void
    /** Bindable so the host can tell whether the sheet is up. */
    open?: boolean
    /** The people who can be filtered to, already scoped and without the signed-in user. */
    people?: UserListItem[]
    /** Selected region, or `undefined` for all of them. */
    regionFk?: number
    /** The user's regions. With one there is nothing to pick, so that section is hidden. */
    regions?: Pick<UserRegion, 'name' | 'regionFk' | 'role'>[]
    /** Selected actor, or `undefined` for everyone. */
    userFk?: number
  }

  let {
    currentUserFk,
    filtered = false,
    onReset,
    open = $bindable(false),
    people = [],
    regionFk = $bindable(),
    regions = [],
    userFk = $bindable(),
  }: Props = $props()

  // Only worth saying while the list spans several regions: once one is picked, every person in
  // it is in that one, and the crumb would repeat the chip in the header.
  const showCrumbs = $derived(regionFk == null && regions.length > 1)

  // How tall the sheet opens, from the one thing that decides whether it needs the room: how many
  // rows it is about to render. Keyed to the region count instead, a one-region user with fifty
  // people in it got the shortest sheet and a two-region user with three got a tall one.
  // ponytail: three steps off the row count, not a measured height. A row is a fixed 56px, so the
  // count is the height; measure it if the rows ever stop being uniform.
  const rows = $derived((regions.length > 1 ? regions.length + 1 : 0) + (currentUserFk == null ? 1 : 2) + people.length)
  const snapPoints = $derived(rows > 12 ? [0.9] : rows > 6 ? [0.7] : [0.5])

  const regionNames = (regionFks: number[]) =>
    regions
      .filter((region) => regionFks.includes(region.regionFk))
      .map((region) => region.name)
      .join(', ')
</script>

<Modal backdrop bind:open contentClass="w-80" {snapPoints} title={m.feed_filterTitle()}>
  {#snippet trigger(props)}
    <button
      {...props}
      type="button"
      class={[props.class, 'btn-icon', filtered ? 'preset-filled-primary-500' : 'preset-tonal-surface']}
      aria-label={m.feed_filterTitle()}
      onclick={() => (open = !open)}
    >
      <Icon name="filter" size={18} />
    </button>
  {/snippet}

  <div class="space-y-4 p-1">
    {#if regions.length > 1}
      <section>
        <h3 class="text-surface-600-400 mb-1 px-1 text-xs font-bold tracking-wide uppercase">{m.feed_region()}</h3>

        <MenuRow
          icon="layers"
          label={m.feed_allRegions()}
          selected={regionFk == null}
          onclick={() => (regionFk = undefined)}
        />
        {#each regions as region (region.regionFk)}
          <MenuRow
            description={roleLabel(region.role)}
            icon="map"
            label={region.name}
            selected={regionFk === region.regionFk}
            onclick={() => (regionFk = region.regionFk)}
          />
        {/each}
      </section>
    {/if}

    <section>
      <h3 class="text-surface-600-400 mb-1 px-1 text-xs font-bold tracking-wide uppercase">{m.feed_person()}</h3>

      <!-- Every row here is a `MenuRow`, people included: an avatar in the icon's 40px slot keeps
           them lined up with the two options above, which an `EntityRow` (52px, its own padding
           and weights) did not. -->
      <MenuRow icon="users" label={m.feed_everyone()} selected={userFk == null} onclick={() => (userFk = undefined)} />
      {#if currentUserFk != null}
        <MenuRow
          icon="user"
          label={m.feed_justMe()}
          selected={userFk === currentUserFk}
          onclick={() => (userFk = currentUserFk)}
        />
      {/if}

      {#each people as person (person.id)}
        <MenuRow
          avatar={person.username}
          description={showCrumbs ? regionNames(person.regionFks) : undefined}
          label={person.username}
          selected={userFk === person.id}
          onclick={() => (userFk = person.id)}
        />
      {/each}
    </section>
  </div>

  {#snippet footer()}
    <button type="button" class="btn preset-tonal-surface w-full" disabled={!filtered} onclick={onReset}>
      {m.common_reset()}
    </button>
  {/snippet}
</Modal>
