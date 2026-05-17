<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { getI18n } from '$lib/i18n'
  import type { KeyboardEventHandler } from 'svelte/elements'

  const { t } = getI18n()

  let value = $state(page.url.searchParams.get('q') ?? '')

  const submitQuery = (query: string, name: string) => {
    const searchParams = new URLSearchParams(page.url.searchParams)
    if (query.length === 0) {
      searchParams.delete(name)
    } else {
      searchParams.set(name, query)
    }

    const url = new URL(page.url)
    url.pathname = resolve('/(new)/bla/(modal)/search')
    url.search = searchParams.toString()

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
</script>

<div class="input-group flex">
  <input
    bind:value
    class="ig-input preset-filled-surface-200-800 w-full max-w-64"
    name="q"
    onkeyup={onchange}
    placeholder={t('common.search')}
    type="search"
  />

  <button
    class="ig-cell preset-filled-surface-200-800"
    onclick={() => submitQuery(value, 'q')}
    title={t('common.search')}
  >
    <i class="fa-solid fa-search"></i>
  </button>
</div>
