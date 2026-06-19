<script lang="ts">
  import type { RemoteFormIssue } from '@sveltejs/kit'
  import { resolveIssueMessage } from './issue'

  // Renders form-level issues — those raised by `invalid('msg')` in a handler, which carry an
  // empty `path`. Field-tied issues (`invalid(issue.name(...))`) keep rendering inline via FormHint.
  interface Props {
    form: { fields: { allIssues(): RemoteFormIssue[] | undefined } }
  }

  const { form }: Props = $props()
  const issues = $derived((form.fields.allIssues() ?? []).filter((issue) => issue.path.length === 0))
</script>

{#if issues.length > 0}
  <div class="card preset-tonal-error px-4 py-3 text-sm" role="alert">
    {#each issues as issue, i (i)}
      <p>{resolveIssueMessage(issue.message)}</p>
    {/each}
  </div>
{/if}
