<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import type { RemoteFormIssue } from '@sveltejs/kit'

  interface Props {
    hint?: string
    id?: string | null
    issues?: RemoteFormIssue[]
  }

  let { hint, id, issues = [] }: Props = $props()

  // The server emits a paraglide message key (optionally JSON-wrapped with params) as the
  // zod error message; the locale is only known on the client, so we resolve it here.
  function t(key: string, params?: Record<string, unknown>): string {
    const fn = (m as unknown as Record<string, (i?: Record<string, unknown>) => string>)[key]
    return fn ? fn(params) : key // ponytail: unknown key falls back to the raw string
  }
</script>

{#if issues.length > 0}
  {#each issues as issue, i (i)}
    {@const parsed = (() => {
      try {
        const p = JSON.parse(issue.message)
        return p?.message ? p : null
      } catch {
        return { message: issue.message }
      }
    })()}

    <div id={id == null ? undefined : `${id}-error`}>
      <p class="text-error-500 text-sm opacity-80">
        {t(parsed.message, parsed.params)}
      </p>
    </div>
  {/each}
{:else if hint != null}
  <div id={id == null ? undefined : `${id}-hint`}>
    <p class="text-surface-600-400 text-sm">{hint}</p>
  </div>
{/if}
