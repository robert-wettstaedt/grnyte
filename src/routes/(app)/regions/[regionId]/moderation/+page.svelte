<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { entityHref } from '$lib/entities/href'
  import DecisionList from '$lib/entities/moderation/DecisionList.svelte'
  import { listRegionDecisions } from '$lib/entities/moderation/moderation.remote'
  import { regionAdminScreen } from '$lib/entities/region/adminScreen.svelte'
  import ReportQueue from '$lib/entities/report/ReportQueue.svelte'
  import { listRegionReports } from '$lib/entities/report/reports.remote'
  import { m } from '$lib/paraglide/messages'
  import { untrack } from 'svelte'
  import RegionAdminRequired from '../RegionAdminRequired.svelte'
  import RegionScreen from '../RegionScreen.svelte'

  const screen = regionAdminScreen()
  const query = $derived(screen.isModerator ? listRegionDecisions({ regionFk: screen.regionId }) : undefined)
  const reports = $derived(screen.isModerator ? listRegionReports({ regionFk: screen.regionId }) : undefined)

  // Fresh on every arrival: a removal opened from here comes back to a cached queue and log otherwise.
  $effect(() => {
    const [log, queue] = [query, reports]
    // Only what a past visit already holds: a first visit is fetching anyway.
    untrack(() => {
      if (log?.current != null) void log.refresh()
      if (queue?.current != null) void queue.refresh()
    })
  })
</script>

<svelte:head>
  <title>{m.moderation_log()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<RegionScreen backTo={entityHref('regions', screen.regionId)} title={m.moderation_log()}>
  {#if query == null || reports == null}
    <RegionAdminRequired description={m.moderation_logAdminOnly()} regionId={screen.regionId} />
  {:else}
    <div class="space-y-8">
      <section class="space-y-4" aria-labelledby="moderation-reports">
        <div class="space-y-1">
          <h2 id="moderation-reports" class="text-surface-950-50 font-semibold">{m.reports_queue()}</h2>
          <p class="text-surface-600-400 text-sm">{m.reports_queueHint()}</p>
        </div>

        <QueryState resource={remoteResource(reports)}>
          {#snippet ready(rows)}
            <ReportQueue ondismiss={() => reports.refresh()} {rows} />
          {/snippet}
          {#snippet empty()}
            <p class="text-surface-600-400 text-sm">{m.reports_queueEmpty()}</p>
          {/snippet}
        </QueryState>
      </section>

      <section class="space-y-4" aria-labelledby="moderation-decisions">
        <div class="space-y-1">
          <h2 id="moderation-decisions" class="text-surface-950-50 font-semibold">{m.moderation_decisions()}</h2>
          <p class="text-surface-600-400 text-sm">{m.moderation_logHint()}</p>
        </div>

        <QueryState resource={remoteResource(query)}>
          {#snippet ready(rows)}
            <DecisionList onundo={() => query.refresh()} {rows} />
          {/snippet}
          {#snippet empty()}
            <p class="text-surface-600-400 text-sm">{m.moderation_decisionsEmpty()}</p>
          {/snippet}
        </QueryState>
      </section>
    </div>
  {/if}
</RegionScreen>
