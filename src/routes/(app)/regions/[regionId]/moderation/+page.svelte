<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { entityHref } from '$lib/entities/href'
  import DecisionList from '$lib/entities/moderation/DecisionList.svelte'
  import { listRegionDecisions } from '$lib/entities/moderation/moderation.remote'
  import { regionAdminScreen } from '$lib/entities/region/adminScreen.svelte'
  import { m } from '$lib/paraglide/messages'
  import RegionAdminRequired from '../RegionAdminRequired.svelte'
  import RegionScreen from '../RegionScreen.svelte'

  const screen = regionAdminScreen()
  const query = $derived(screen.isModerator ? listRegionDecisions({ regionFk: screen.regionId }) : undefined)
</script>

<svelte:head>
  <title>{m.moderation_log()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<RegionScreen backTo={entityHref('regions', screen.regionId)} title={m.moderation_log()}>
  {#if query == null}
    <RegionAdminRequired description={m.moderation_logAdminOnly()} regionId={screen.regionId} />
  {:else}
    <div class="space-y-4">
      <p class="text-surface-600-400 text-sm">{m.moderation_logHint()}</p>

      <QueryState resource={remoteResource(query)}>
        {#snippet ready(rows)}
          <DecisionList onundo={() => query.refresh()} {rows} />
        {/snippet}
        {#snippet empty()}
          <p class="text-surface-600-400 text-sm">{m.moderation_decisionsEmpty()}</p>
        {/snippet}
      </QueryState>
    </div>
  {/if}
</RegionScreen>
