<script lang="ts">
  import type { RemoteFormIssue } from '@sveltejs/kit'
  import { resolveIssueMessage } from './issue'

  interface Props {
    hint?: string
    id?: string | null
    issues?: RemoteFormIssue[]
  }

  let { hint, id, issues = [] }: Props = $props()
</script>

{#if issues.length > 0}
  {#each issues as issue, i (i)}
    <div id={id == null ? undefined : `${id}-error`}>
      <p class="text-error-500 text-sm opacity-80">
        {resolveIssueMessage(issue.message)}
      </p>
    </div>
  {/each}
{:else if hint != null}
  <div id={id == null ? undefined : `${id}-hint`}>
    <p class="text-surface-600-400 text-sm">{hint}</p>
  </div>
{/if}
