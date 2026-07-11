<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { replaceUrl } from '$lib/state/navigation.svelte'
  import type { Snippet } from 'svelte'
  import type { KeyboardEventHandler } from 'svelte/elements'
  import { MediaQuery, SvelteURL, SvelteURLSearchParams } from 'svelte/reactivity'
  import SearchField from './SearchField.svelte'

  interface Props {
    /** Trailing content inside the bar (e.g. the Filter pill). */
    trailing?: Snippet
  }

  const { trailing }: Props = $props()

  let value = $state(page.url.searchParams.get('q') ?? '')
  let inputEl = $state<HTMLInputElement>()

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

  const submitQuery = (query: string, name: string) => {
    const searchParams = new SvelteURLSearchParams(page.url.searchParams)
    if (query.length === 0) {
      searchParams.delete(name)
    } else {
      searchParams.set(name, query)
    }

    const url = new SvelteURL(page.url)
    url.pathname = resolve('/explore/search')
    url.search = searchParams.toString()

    void replaceUrl(url, { keepFocus: true })
  }

  const onchange: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key !== 'Enter') {
      return
    }

    submitQuery(event.currentTarget.value.trim(), 'q')
  }

  const reset = () => {
    value = ''
    submitQuery('', 'q')
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<SearchField bind:value bind:inputEl {placeholder} onClear={reset} onkeyup={onchange} {trailing}>
  {#snippet leading()}
    <button
      type="button"
      class="text-surface-600-400 shrink-0"
      onclick={() => submitQuery(value, 'q')}
      title={m.common_search()}
    >
      <Icon name="search" size={18} />
    </button>
  {/snippet}
</SearchField>
