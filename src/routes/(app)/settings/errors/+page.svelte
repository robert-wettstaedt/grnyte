<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Disclosure from '$lib/components/Disclosure/Disclosure.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { listErrorLogs } from '$lib/logging/errors.remote'
  import { clearResumeLog, readResumeLog } from '$lib/logging/resumeLog'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { back } from '$lib/state/navigation.svelte'

  // Created once rather than inside a $derived: the query takes no arguments, so there is
  // nothing for it to react to.
  const logs = remoteResource(listErrorLogs())

  // A snapshot is enough: nobody watches "4 minutes ago" tick over on a log screen.
  const now = Date.now()

  // Temporary instrumentation, device-local: see `$lib/logging/resumeLog`. Newest first here,
  // appended oldest-first there. Read into state so clearing re-renders without a reload.
  let resumes = $state(readResumeLog().toReversed())

  const clearResumes = () => {
    clearResumeLog()
    resumes = []
  }

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

  <!-- Device-local, so it sits outside the QueryState above: there is nothing to load or fail. -->
  <section class="space-y-2">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">{m.settings_resumeLog()}</h2>

      {#if resumes.length > 0}
        <button type="button" class="btn btn-sm preset-tonal-surface flex-none" onclick={clearResumes}>
          {m.settings_resumeLogClear()}
        </button>
      {/if}
    </div>

    <p class="text-surface-600-400 text-xs">{m.settings_resumeLogHint()}</p>

    {#if resumes.length === 0}
      <p class="text-surface-600-400 py-4 text-sm">{m.settings_resumeLogEmpty()}</p>
    {:else}
      <ul class="divide-surface-200-800 border-surface-200-800 divide-y overflow-hidden rounded-xl border">
        {#each resumes as resume (resume.at)}
          <li class="flex items-center justify-between gap-3 p-4">
            <span class="min-w-0 flex-1 truncate text-sm">
              {m.settings_resumeLogEntry({ seconds: Math.round(resume.elapsedMs / 100) / 10 })}
            </span>
            <span class="text-surface-600-400 flex-none text-xs">
              {formatUploadedAt(resume.at, now, getLocale())}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <QueryState resource={logs}>
    {#snippet ready(groups)}
      <!-- `overflow-hidden`, or a first/last summary's hover background squares off the rounded corners. -->
      <div class="divide-surface-200-800 border-surface-200-800 divide-y overflow-hidden rounded-xl border">
        {#each groups as group (group.source + group.error)}
          <!-- The stack is long, so every row expands independently. -->
          <Disclosure
            panelClass="space-y-2 px-4 pb-4"
            summaryClass="hover:bg-surface-100-900 flex w-full items-center gap-3 p-4"
          >
            {#snippet summary(open)}
              <span class="badge preset-tonal-error flex-none">{group.count}×</span>

              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm">{headline(group.error)}</span>
                <span class="text-surface-600-400 block truncate text-xs">
                  {group.source} · {formatUploadedAt(group.lastSeen, now, getLocale())}
                </span>
              </span>

              <span class={['text-surface-500 flex-none transition-transform', open && 'rotate-180']}>
                <Icon name="chevron-down" size={18} />
              </span>
            {/snippet}

            {#if group.paths.length > 0}
              <p class="text-surface-600-400 text-xs">{group.paths.join(', ')}</p>
            {/if}

            <pre class="bg-surface-100-900 overflow-x-auto rounded-lg p-3 text-xs">{body(group.error)}</pre>
          </Disclosure>
        {/each}
      </div>
    {/snippet}
  </QueryState>
</div>
