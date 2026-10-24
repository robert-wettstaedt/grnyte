<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import DecisionList from '$lib/entities/moderation/DecisionList.svelte'
  import { listDecisions } from '$lib/entities/moderation/moderation.remote'
  import { m } from '$lib/paraglide/messages'
  import { back } from '$lib/state/navigation.svelte'

  const query = listDecisions()
  const decisions = remoteResource(query)
</script>

<svelte:head>
  <title>{m.moderation_decisions()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/settings'))} title={m.moderation_decisions()} />

<div class="container mx-auto max-w-3xl space-y-4 px-4 py-8 pb-24 md:pb-8">
  <p class="text-surface-600-400 text-sm">{m.moderation_decisionsHint()}</p>

  <QueryState resource={decisions}>
    {#snippet ready(rows)}
      <DecisionList onundo={() => query.refresh()} {rows} showRegion />
    {/snippet}
    {#snippet empty()}
      <p class="text-surface-600-400 text-sm">{m.moderation_decisionsEmpty()}</p>
    {/snippet}
  </QueryState>
</div>
