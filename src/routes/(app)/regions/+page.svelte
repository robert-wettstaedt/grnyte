<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Row from '$lib/components/EntityRow/Row.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { listAllRegions } from '$lib/entities/region/stats.remote'
  import { resolveErrorMessage } from '$lib/forms/issue'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { back } from '$lib/state/navigation.svelte'

  // Created outside a $derived: the query takes no arguments, so nothing can change it. Kept
  // alongside the resource because only it carries the status a refusal has to be told apart by.
  const query = listAllRegions()
  const regions = remoteResource(query)

  // A snapshot is enough: nobody watches "4 minutes ago" tick over on an operator screen.
  const now = Date.now()

  const lastActive = (at: number | undefined) =>
    at == null ? m.region_statsNoActivity() : formatUploadedAt(at, now, getLocale())
</script>

<svelte:head>
  <title>{m.region_statsAll()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/settings'))} title={m.region_statsAll()} />

<div class="container mx-auto max-w-2xl px-4 py-8 pb-24 md:pb-8">
  <QueryState resource={regions}>
    {#snippet error()}
      <div class="card preset-tonal-error px-4 py-3 text-sm" role="alert">
        {resolveErrorMessage(query.error)}
      </div>
    {/snippet}

    {#snippet ready(rows)}
      <!-- An entity listing, not a settings row: the name leads and its numbers sit on their own
           line, so a long one never competes with the name for the same line. -->
      <div class="space-y-2">
        {#each rows as region (region.id)}
          <Row
            description="{m.region_members()}: {region.members} · {lastActive(region.lastActivityAt)}"
            href={resolve('/(app)/regions/[regionId]/stats', { regionId: String(region.id) })}
            title={region.name}
          />
        {/each}
      </div>
    {/snippet}
  </QueryState>
</div>
