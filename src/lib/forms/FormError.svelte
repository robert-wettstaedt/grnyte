<script lang="ts">
  import Banner from '$lib/components/Banner/Banner.svelte'
  import type { RemoteFormIssue } from '@sveltejs/kit'
  import { resolveIssueMessage } from './issue'

  // Form-level issues only (an empty `path`); field-tied ones render inline via FormHint.
  interface Props {
    form: { fields: { allIssues(): RemoteFormIssue[] | undefined } }
  }

  const { form }: Props = $props()

  const issues = $derived((form.fields.allIssues() ?? []).filter((issue) => issue.path.length === 0))
</script>

{#if issues.length > 0}
  <Banner tone="error">
    {#each issues as issue, i (i)}
      <p>{resolveIssueMessage(issue.message)}</p>
    {/each}
  </Banner>
{/if}
