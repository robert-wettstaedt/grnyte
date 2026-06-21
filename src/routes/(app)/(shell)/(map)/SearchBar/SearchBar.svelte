<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { KeyboardEventHandler } from 'svelte/elements'
  import { SvelteURL, SvelteURLSearchParams } from 'svelte/reactivity'

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

    const target = event.target as HTMLInputElement
    const query = target.value.trim()
    const name = target.name

    submitQuery(query, name)
  }

  const reset = () => {
    value = ''
    submitQuery('', 'q')
  }
</script>

<div class="input-group flex md:grow">
  <div class="preset-filled-surface-100-900 relative flex w-full max-w-64 md:max-w-none">
    <input
      bind:value
      class="ig-input w-full rounded-l-lg pr-10!"
      name="q"
      onkeyup={onchange}
      placeholder={m.common_search()}
      type="search"
    />

    {#if value.length > 0}
      <button
        class="absolute inset-y-0 right-0 flex items-center px-3 opacity-60 transition-opacity hover:opacity-100"
        onclick={reset}
        title={m.common_clear()}
        type="button"
      >
        <Icon name="close" size={16} />
      </button>
    {/if}
  </div>

  <button
    class="ig-cell preset-filled-surface-100-900 border-0! text-sm"
    onclick={() => submitQuery(value, 'q')}
    title={m.common_search()}
  >
    <Icon name="search" size={16} />
  </button>
</div>
