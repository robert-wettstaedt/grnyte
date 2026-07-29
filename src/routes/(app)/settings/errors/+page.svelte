<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { listErrorLogs } from '$lib/logging/errors.remote'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { back } from '$lib/state/navigation.svelte'

  // Created once rather than inside a $derived: the query takes no arguments, so there is
  // nothing for it to react to.
  const logs = listErrorLogs()
  const groups = $derived(logs.current ?? [])

  // A snapshot is enough: nobody watches "4 minutes ago" tick over on a log screen.
  const now = Date.now()

  // `stringifyError` writes name, message, then stack. The first two lines are what makes a row
  // scannable; the rest lives behind the disclosure.
  const headline = (error: string) => error.split('\n').slice(0, 2).join(': ')

  // A throw that was not an Error (a SvelteKit HttpError, say) was stored as one line of JSON.
  // Indent it for reading. Formatted here rather than at write time so the row keeps the raw copy.
  const body = (error: string) => {
    try {
      return JSON.stringify(JSON.parse(error), null, 2)
    } catch {
      return error
    }
  }
</script>

<svelte:head>
  <title>{m.settings_errorLogs()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/settings'))} title={m.settings_errorLogs()} />

<div class="container mx-auto max-w-3xl space-y-4 px-4 py-8 pb-24 md:pb-8">
  <p class="text-surface-600-400 text-sm">{m.settings_errorLogsHint()}</p>

  {#if logs.error}
    <div class="card preset-tonal-error px-4 py-3 text-sm" role="alert">{m.queryState_error()}</div>
  {:else if logs.loading}
    <div class="space-y-4 py-4" aria-busy="true">
      <div class="placeholder animate-pulse"></div>
      <div class="placeholder animate-pulse"></div>
      <div class="placeholder animate-pulse"></div>
    </div>
  {:else if groups.length === 0}
    <p class="text-surface-600-400 py-8 text-center">{m.queryState_empty()}</p>
  {:else}
    <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
      {#each groups as group (group.source + group.error)}
        <!-- Native disclosure: the stack is long, and every row needs to expand independently. -->
        <details>
          <summary class="hover:bg-surface-100-900 flex cursor-pointer items-center gap-3 p-4">
            <span class="badge preset-tonal-error flex-none">{group.count}×</span>

            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm">{headline(group.error)}</span>
              <span class="text-surface-600-400 block truncate text-xs">
                {group.source} · {formatUploadedAt(group.lastSeen, now, getLocale())}
              </span>
            </span>
          </summary>

          <div class="space-y-2 px-4 pb-4">
            {#if group.paths.length > 0}
              <p class="text-surface-600-400 text-xs">{group.paths.join(', ')}</p>
            {/if}

            <pre class="bg-surface-100-900 overflow-x-auto rounded-lg p-3 text-xs">{body(group.error)}</pre>
          </div>
        </details>
      {/each}
    </div>
  {/if}
</div>
