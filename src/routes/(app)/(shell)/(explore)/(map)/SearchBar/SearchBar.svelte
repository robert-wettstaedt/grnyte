<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import EntityList from '$lib/components/EntitySearch/EntityList.svelte'
  import { clearViewed, loadViewed, newEntities, recentlyViewed } from '$lib/components/EntitySearch/recent.svelte'
  import { entityHref, entitySearch, type EntityCandidate } from '$lib/components/EntitySearch/search.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { regionCrumb } from '$lib/entities/region/mapper'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { replaceUrl } from '$lib/state/navigation.svelte'
  import { liveSearchQuery, setLiveSearchQuery } from '$lib/state/searchQuery.svelte'
  import { visualViewport } from '$lib/state/visualViewport.svelte'
  import type { Snippet } from 'svelte'
  import type { Attachment } from 'svelte/attachments'
  import { MediaQuery, SvelteURL, SvelteURLSearchParams } from 'svelte/reactivity'
  import { fly, slide } from 'svelte/transition'
  import SearchField from './SearchField.svelte'
  import { addToHistory, loadHistory, removeFromHistory, saveHistory } from './searchHistory'

  interface Props {
    /** Trailing content inside the bar (e.g. the Filter pill). */
    trailing?: Snippet
  }

  const { trailing }: Props = $props()

  const global = getGlobalState()

  // Seed from the persisted live query first so the text survives opening a detail
  // and coming back (the bar unmounts on detail routes); fall back to the committed
  // `?q=` for a fresh deep link.
  let value = $state(liveSearchQuery().current || (page.url.searchParams.get('q') ?? ''))
  let inputEl = $state<HTMLInputElement>()
  let containerEl = $state<HTMLElement>()
  let open = $state(false)
  let activeIndex = $state(0)
  let history = $state(loadHistory())

  const query = $derived(value.trim())
  const showHistory = $derived(query.length === 0)

  // Publish the live query so the explore map filters its markers as you type,
  // even before submit. Kept on teardown (not cleared) so the query survives a
  // round trip through a detail route and is restored when the bar remounts; the
  // clear (×) button is what resets it.
  $effect(() => {
    setLiveSearchQuery(query)
  })

  const crumbFor = (regionFk: number) => regionCrumb(global.userRegions, regionFk)
  const regionFks = () => global.userRegions.map((region) => region.regionFk)

  // Live entity results, same source as the MarkdownEditor `@`-picker — but
  // searched across every region the user belongs to (incl. users), and with a
  // region crumb on each result once they span more than one.
  const search = entitySearch({
    open: () => open && query.length > 0,
    query: () => query,
    regionCrumb: crumbFor,
    regionFks,
  })

  // Empty-state sections under the recent queries: what this browser opened last, then
  // the newest entities in the user's regions (the feed buries those under ascents and
  // edits). Only ids are stored for the views, so Zero supplies current labels.
  let viewed = $state(loadViewed())

  const emptyState = $derived(open && showHistory)

  const viewedEntities = recentlyViewed({
    enabled: () => emptyState,
    refs: () => viewed,
    regionCrumb: crumbFor,
    regionFks,
  })

  const latestEntities = newEntities({
    enabled: () => emptyState,
    exclude: () => viewed,
    regionCrumb: crumbFor,
  })

  // Recently viewed names places and people, so it gets its own Clear: wiping the
  // recent *queries* must not look like it wiped the list under the next heading.
  const clearViewedEntities = () => {
    viewed = []
    clearViewed()
  }

  const emptyGroups = $derived(
    [
      {
        items: viewedEntities.items,
        key: 'viewed',
        label: m.search_recentlyViewed(),
        onclear: clearViewedEntities,
      },
      { items: latestEntities.items, key: 'new', label: m.search_newlyAdded() },
    ].filter((group) => group.items.length > 0),
  )
  const emptyCandidates = $derived(emptyGroups.flatMap((group) => group.items))

  // Rows under the cursor for keyboard nav: recent queries plus the empty-state
  // sections while nothing is typed, else the live results.
  //
  // Reading nothing while the flyout is shut is the point, not an optimisation: the
  // resources behind these lists are built on first read of their data, so counting
  // rows here would spin up every empty-state query on each mount of the map, for a
  // dropdown nobody opened. Closed means no rows, which is also what focus resets to.
  const count = $derived.by(() => {
    if (!open) {
      return 0
    }
    return showHistory ? history.length + emptyCandidates.length : search.flat.length
  })
  const hasRows = $derived(count > 0)

  // Typing narrows the list, so keep the highlight in range — otherwise it points
  // at a row that's gone and Enter falls through to a plain query submit.
  $effect(() => {
    if (activeIndex > count - 1) {
      activeIndex = Math.max(0, count - 1)
    }
  })

  // Mobile: pin the dropdown to the visible viewport so it tracks above the
  // on-screen keyboard instead of drifting with the iOS fixed-position bug.
  const vv = visualViewport()
  const mobile = new MediaQuery('(max-width: 767px)')
  const pinned = $derived(mobile.current && vv.height > 0)

  const dropdownTop = $derived(pinned ? `calc(4rem + ${vv.offsetTop}px)` : undefined)

  // Cap the height to the visible area. The bottom tab bar only needs reserving
  // while it is actually on screen (keyboard shut); once the keyboard is up it
  // already sits below the visible viewport, so only a small gap is needed.
  const dropdownMaxHeight = $derived.by(() => {
    if (!pinned) {
      return undefined
    }
    const keyboardOpen = window.innerHeight - vv.offsetTop - vv.height > 60
    return keyboardOpen
      ? `calc(${vv.height}px - 4.5rem)`
      : `calc(${vv.height}px - 8.5rem - env(safe-area-inset-bottom))`
  })

  // ponytail: no "physical keyboard" web API — hover + fine pointer is the standard desktop heuristic
  const hasKeyboard = new MediaQuery('(hover: hover) and (pointer: fine)')
  const shortcut = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘K' : 'Ctrl+K'
  const placeholder = $derived(hasKeyboard.current ? `${m.common_search()} (${shortcut})` : m.common_search())

  const onWindowKeydown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      inputEl?.focus()
    }
  }

  // Dismiss on an outside press. Focus-based closing (`focusout`) breaks on iOS,
  // where tapping a result blurs the input and tears down the dropdown before its
  // click can land — so nothing happens but the close.
  const onWindowPointerdown = (event: PointerEvent) => {
    if (open && containerEl != null && !containerEl.contains(event.target as Node)) {
      open = false
    }
  }

  const remember = (queryToStore: string) => {
    history = addToHistory(history, queryToStore)
    saveHistory(history)
  }

  const clearHistory = () => {
    history = []
    saveHistory(history)
  }

  const removeRecent = (recent: string) => {
    history = removeFromHistory(history, recent)
    saveHistory(history)
    // Keep focus in the bar so removing the row doesn't collapse the dropdown.
    inputEl?.focus()
  }

  // Fall-through submit (Enter with nothing highlighted, or the leading button):
  // record the query and hand it to the /search route via `?q=`.
  const submit = (queryToSubmit: string) => {
    const searchParams = new SvelteURLSearchParams(page.url.searchParams)
    if (queryToSubmit.length === 0) {
      searchParams.delete('q')
    } else {
      searchParams.set('q', queryToSubmit)
      remember(queryToSubmit)
    }

    const url = new SvelteURL(page.url)
    url.pathname = resolve('/search')
    url.search = searchParams.toString()

    open = false
    void replaceUrl(url, { keepFocus: true })
  }

  const selectResult = (item: EntityCandidate) => {
    // Only a typed query is worth remembering. Picking out of the empty state has none,
    // and storing it would rewrite the same history blob on the way to a navigation.
    if (query.length > 0) {
      remember(query)
    }
    open = false
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- entityHref() resolves the route id
    void goto(entityHref(item))
  }

  const selectRecent = (recent: string) => {
    value = recent
    activeIndex = 0
    inputEl?.focus()
  }

  const onkeydown = (event: KeyboardEvent) => {
    if (!open) {
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        activeIndex = hasRows ? (activeIndex + 1) % count : 0
        break
      case 'ArrowUp':
        event.preventDefault()
        activeIndex = hasRows ? (activeIndex - 1 + count) % count : 0
        break
      case 'Enter': {
        event.preventDefault()
        if (showHistory) {
          // Recent queries own the first `history.length` rows, the entity sections the rest.
          const recent = history[activeIndex]
          const item = emptyCandidates[activeIndex - history.length]
          if (recent != null) {
            selectRecent(recent)
          } else if (item != null) {
            selectResult(item)
          } else {
            submit(query)
          }
        } else {
          const item = search.flat[activeIndex]
          if (item == null) {
            submit(query)
          } else {
            selectResult(item)
          }
        }
        break
      }
      case 'Escape':
        open = false
        break
    }
  }

  const reset = () => {
    value = ''
    activeIndex = 0
    // On the results page the committed `?q=` still drives the list, so drop it too
    // or the emptied field would leave stale results behind. On the map there's
    // nothing committed to clear.
    if (page.url.searchParams.has('q')) {
      submit('')
    }
  }

  // Swallow mousedown inside the dropdown so tapping a row never blurs the input.
  const keepInputFocused: Attachment = (node) => {
    const swallow = (event: Event) => event.preventDefault()
    node.addEventListener('mousedown', swallow)
    return () => node.removeEventListener('mousedown', swallow)
  }
</script>

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerdown} />

<div bind:this={containerEl} class="relative w-full min-w-0">
  <SearchField
    bind:value
    bind:inputEl
    {placeholder}
    onClear={reset}
    onfocus={() => {
      open = true
      activeIndex = 0
      // Detail pages record their views while this bar is unmounted, so re-read on focus.
      viewed = loadViewed()
    }}
    {onkeydown}
    {trailing}
  >
    {#snippet leading()}
      <button
        type="button"
        class="text-surface-600-400 shrink-0"
        onclick={() => submit(query)}
        title={m.common_search()}
      >
        <Icon name="search" size={18} />
      </button>
    {/snippet}
  </SearchField>

  {#if open && (query.length > 0 || history.length > 0 || emptyGroups.length > 0)}
    <!-- Mobile: full-width panel pinned to the visible viewport (`top`/`max-height`
         from the VisualViewport) so the on-screen keyboard can't push it off-screen
         and it clears the bottom tab bar, plus `overscroll-contain` against scroll
         chaining. `mousedown` is swallowed so tapping a row keeps the input focused
         (keyboard stays up, iOS doesn't tear the row out from under the tap).
         Desktop: anchored under the bar. -->
    <div
      class="bg-surface-100-900 border-surface-200-800 fixed top-16 right-1 left-1 z-20 max-h-[calc(100dvh-9rem)] overflow-y-auto overscroll-contain rounded-xl border shadow-xl md:absolute md:top-full md:right-0 md:left-0 md:mt-2 md:max-h-[60vh]"
      style:top={dropdownTop}
      style:max-height={dropdownMaxHeight}
      transition:fly={{ duration: 150, y: -8 }}
      {@attach keepInputFocused}
    >
      {#if showHistory}
        {#if history.length > 0}
          <div class="flex items-center justify-between px-3 pt-2 pb-1">
            <p class="text-surface-500 text-[11px] font-bold tracking-wide uppercase">{m.search_recent()}</p>
            <button type="button" class="text-surface-500 hover:text-surface-950-50 text-xs" onclick={clearHistory}>
              {m.common_clear()}
            </button>
          </div>

          <ul class="flex flex-col gap-0.5 p-1 pt-0">
            {#each history as recent, index (recent)}
              <!-- No `animate:flip`, same as EntityList. An `animate:` directive is what makes
                   Svelte pull a leaving row out of the flow (`position: absolute`) so the rows
                   below jump, which is then what flip has to animate back. Without it the row's
                   own `slide` shrinks it in place and the rest follow along for free. -->
              <li
                class="flex items-center gap-1 rounded-[10px] {index === activeIndex
                  ? 'preset-tonal-primary'
                  : 'hover:bg-surface-200-800'}"
                transition:slide={{ duration: 150 }}
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
                  onclick={() => selectRecent(recent)}
                >
                  <Icon name="history" size={16} class="text-surface-500 shrink-0" />
                  <span class="truncate text-sm">{recent}</span>
                </button>

                <button
                  type="button"
                  class="btn-icon shrink-0"
                  aria-label={m.search_removeRecent()}
                  onclick={() => removeRecent(recent)}
                >
                  <Icon name="close" size={13} />
                </button>
              </li>
            {/each}
          </ul>
        {/if}

        {#if emptyGroups.length > 0}
          <EntityList {activeIndex} groups={emptyGroups} indexOffset={history.length} onselect={selectResult} />
        {/if}
      {:else}
        <EntityList {activeIndex} groups={search.groups} onselect={selectResult} />
      {/if}
    </div>
  {/if}
</div>
