<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { Snippet } from 'svelte'
  import type { KeyboardEventHandler } from 'svelte/elements'
  import { SvelteURL, SvelteURLSearchParams } from 'svelte/reactivity'
  import SearchField from './SearchField.svelte'

  interface Props {
    /** Trailing content inside the bar (e.g. the Filter pill). */
    trailing?: Snippet
  }

  const { trailing }: Props = $props()

  let value = $state(page.url.searchParams.get('q') ?? '')

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

    // eslint-disable-next-line svelte/no-navigation-without-resolve
    goto(url, { keepFocus: true, replaceState: true })
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

<SearchField bind:value placeholder={m.common_search()} onClear={reset} onkeyup={onchange} {trailing}>
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
