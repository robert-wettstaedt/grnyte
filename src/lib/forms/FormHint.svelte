<script lang="ts">
  import type { RemoteFormIssue } from '@sveltejs/kit'
  import { resolveIssueMessage } from './issue'

  interface Props {
    hint?: string
    id?: null | string
    issues?: RemoteFormIssue[]
  }

  let { hint, id, issues = [] }: Props = $props()
</script>

<!-- One container for all issues: `aria-errormessage` points at this id, only one element may carry it. -->
{#if issues.length > 0}
  <div id={id == null ? undefined : `${id}-error`}>
    {#each issues as issue, i (i)}
      <p class="text-error-500 text-sm opacity-80">
        {resolveIssueMessage(issue.message)}
      </p>
    {/each}
  </div>
{/if}

<!-- Alongside the error, not instead of it: the hint is the instruction, needed most when the field fails. -->
{#if hint != null}
  <div id={id == null ? undefined : `${id}-hint`}>
    <p class="text-surface-600-400 text-sm">{hint}</p>
  </div>
{/if}
