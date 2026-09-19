<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { FirstAscensionistGroup } from '$lib/entities/firstAscensionist/dto'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** The signed-in user's id, for the "first ascent by me" shortcut. */
    currentUserId: number | undefined
    /** One entry per climber, already collapsed across regions by the caller. */
    firstAscensionists: FirstAscensionistGroup[]
    /**
     * The type-ahead term. Owned by the caller rather than held here, so the filter panel can
     * clear it alongside everything else it resets on open: a desktop panel keeps its body
     * mounted when it closes, so this component outlives a close and would keep the term.
     */
    search?: string
    /** Selected first-ascensionist ids. */
    value: number[]
  }

  let { currentUserId, firstAscensionists, search = $bindable(''), value = $bindable() }: Props = $props()

  /** How many matches to render before asking the user to refine the search. */
  const RESULT_LIMIT = 30
  /** Beyond this the list scrolls, so searching beats scanning it. */
  const SEARCH_THRESHOLD = 5

  // Search and the "by me" shortcut are both ways to find a name in a long list.
  // A list short enough to read at a glance needs neither, and with a single
  // climber the shortcut would duplicate the one row below it.
  const searchable = $derived(firstAscensionists.length > SEARCH_THRESHOLD)

  const mine = $derived(
    currentUserId == null ? undefined : firstAscensionists.find((fa) => fa.userFk === currentUserId),
  )
  const isSelected = (group: FirstAscensionistGroup) => group.ids.some((id) => value.includes(id))

  // A row's presence depends only on the search term (never on selection), so
  // toggling a row keeps it mounted. svelte-bottom-sheet closes when a click's
  // target leaves the DOM, so removing the clicked node here would dismiss the
  // sheet before "Apply" can be pressed.
  const matches = $derived.by(() => {
    const term = searchable ? search.trim().toLowerCase() : ''
    const found = firstAscensionists.filter((fa) => term === '' || fa.name.toLowerCase().includes(term))
    return { overflow: Math.max(0, found.length - RESULT_LIMIT), shown: found.slice(0, RESULT_LIMIT) }
  })

  const toggle = (group: FirstAscensionistGroup) => {
    value = isSelected(group) ? value.filter((id) => !group.ids.includes(id)) : [...new Set([...value, ...group.ids])]
  }
</script>

<div class="flex flex-col gap-2">
  {#if searchable && mine != null}
    {@const mineSelected = isSelected(mine)}
    <button
      type="button"
      aria-pressed={mineSelected}
      class={['btn btn-sm gap-1 self-start', mineSelected ? 'preset-filled-primary-500' : 'preset-tonal']}
      onclick={() => toggle(mine)}
    >
      <Icon name="star" size={14} />
      {m.filter_firstAscentByMe()}
    </button>
  {/if}

  {#if searchable}
    <input class="input" type="search" placeholder={m.filter_searchFirstAscensionists()} bind:value={search} />
  {/if}

  {#if matches.shown.length > 0}
    <ul class="border-surface-200-800 divide-surface-200-800 max-h-48 divide-y overflow-y-auto rounded border">
      {#each matches.shown as fa (fa.name)}
        {@const selected = isSelected(fa)}
        <li>
          <button
            type="button"
            aria-pressed={selected}
            class={[
              'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm',
              selected ? 'preset-tonal-primary' : 'hover:preset-tonal',
            ]}
            onclick={() => toggle(fa)}
          >
            <span>{fa.name}</span>
            {#if selected}
              <Icon name="check" size={16} />
            {/if}
          </button>
        </li>
      {/each}
    </ul>

    {#if matches.overflow > 0}
      <span class="text-surface-600-400 text-xs">{m.filter_firstAscensionistsMore({ count: matches.overflow })}</span>
    {/if}
  {:else if search.trim() !== ''}
    <span class="text-surface-600-400 text-sm">{m.filter_noResults()}</span>
  {/if}
</div>
