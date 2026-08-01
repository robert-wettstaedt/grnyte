<!--
  The feed's filter surface: a mobile sheet, a right-hand aside on desktop (Modal picks).
  Region and person only; the ascent/update split stays on the segmented control, where it
  is one tap. Choices apply as they are made, so there is no Apply button to forget.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { UserRegion } from '$lib/entities/region/dto'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** The signed-in user, the subject of "Just me". */
    currentUserFk?: number
    /** Bindable so the host can tell whether the sheet is up. */
    open?: boolean
    /** Selected region, or `undefined` for all of them. */
    regionFk?: number
    /** The user's regions. With one there is nothing to pick, so that section is hidden. */
    regions?: Pick<UserRegion, 'name' | 'regionFk'>[]
    /** Selected actor, or `undefined` for everyone. */
    userFk?: number
  }

  let {
    currentUserFk,
    open = $bindable(false),
    regionFk = $bindable(),
    regions = [],
    userFk = $bindable(),
  }: Props = $props()

  const filtered = $derived(regionFk != null || userFk != null)

  const reset = () => {
    regionFk = undefined
    userFk = undefined
  }
</script>

<Modal backdrop bind:open contentClass="w-80" title={m.feed_filterTitle()}>
  {#snippet trigger(props)}
    <button
      {...props}
      type="button"
      class={[props.class, 'btn-icon btn-icon-sm', filtered ? 'preset-filled-primary-500' : 'preset-tonal-surface']}
      aria-label={m.feed_filterTitle()}
      onclick={() => (open = !open)}
    >
      <Icon name="filter" size={16} />
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

      <MenuRow icon="users" label={m.feed_everyone()} selected={userFk == null} onclick={() => (userFk = undefined)} />
      {#if currentUserFk != null}
        <MenuRow
          icon="user"
          label={m.feed_justMe()}
          selected={userFk === currentUserFk}
          onclick={() => (userFk = currentUserFk)}
        />
      {/if}
    </section>
  </div>

  {#snippet footer()}
    <button type="button" class="btn preset-tonal-surface w-full" disabled={!filtered} onclick={reset}>
      {m.common_reset()}
    </button>
  {/snippet}
</Modal>
