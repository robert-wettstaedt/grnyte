<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { FirstAscensionist } from '$lib/entities/firstAscensionist/dto'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    firstAscensionists: FirstAscensionist[]
    /** Selected first-ascensionist ids. */
    value: number[]
    /** The signed-in user's id, for the "first ascent by me" shortcut. */
    currentUserId: number | undefined
  }

  let { firstAscensionists, value = $bindable(), currentUserId }: Props = $props()

  /** How many matches to render before asking the user to refine the search. */
  const RESULT_LIMIT = 30

  let search = $state('')

  // First ascensionists linked to the signed-in user power the "by me" shortcut.
  const myIds = $derived(
    currentUserId == null ? [] : firstAscensionists.filter((fa) => fa.userFk === currentUserId).map((fa) => fa.id),
  )
  const mineSelected = $derived(myIds.length > 0 && myIds.every((id) => value.includes(id)))

  // A row's presence depends only on the search term — never on selection — so
  // toggling a row keeps it mounted. svelte-bottom-sheet closes when a click's
  // target leaves the DOM, so removing the clicked node here would dismiss the
  // sheet before "Apply" can be pressed.
  const matches = $derived.by(() => {
    const term = search.trim().toLowerCase()
    const found = firstAscensionists
      .filter((fa) => term === '' || fa.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { shown: found.slice(0, RESULT_LIMIT), overflow: Math.max(0, found.length - RESULT_LIMIT) }
  })

  const toggle = (id: number) => {
    value = value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
  }

  const toggleMine = () => {
    value = mineSelected ? value.filter((id) => !myIds.includes(id)) : [...new Set([...value, ...myIds])]
  }
</script>

<div class="flex flex-col gap-2">
  {#if myIds.length > 0}
    <button
      type="button"
      aria-pressed={mineSelected}
      class={['btn btn-sm gap-1 self-start', mineSelected ? 'preset-filled-primary-500' : 'preset-tonal']}
      onclick={toggleMine}
    >
      <Icon name="star" size={14} />
      {m.filter_firstAscentByMe()}
    </button>
  {/if}

  <input class="input" type="search" placeholder={m.common_search()} bind:value={search} />

  {#if matches.shown.length > 0}
    <ul class="border-surface-200-800 divide-surface-200-800 max-h-48 divide-y overflow-y-auto rounded border">
      {#each matches.shown as fa (fa.id)}
        {@const selected = value.includes(fa.id)}
        <li>
          <button
            type="button"
            aria-pressed={selected}
            class={[
              'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm',
              selected ? 'preset-tonal-primary' : 'hover:preset-tonal',
            ]}
            onclick={() => toggle(fa.id)}
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
