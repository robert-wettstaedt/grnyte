<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import GradeHistogram from '$lib/components/GradeHistogram/GradeHistogram.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import SettingSection from '$lib/components/Setting/SettingSection.svelte'
  import StatTile from '$lib/components/StatTile/StatTile.svelte'
  import { entityHref } from '$lib/entities/href'
  import { regionStats } from '$lib/entities/region/stats.remote'
  import { assignableRoles } from '$lib/entities/rolePermission/dto'
  import { roleLabel } from '$lib/entities/rolePermission/mapper'
  import { resolveErrorMessage } from '$lib/forms/issue'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { now } from '$lib/state/now.svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import { fade } from 'svelte/transition'
  import ActivityChart from './ActivityChart.svelte'

  // Global state only for the grades and the reader's scale, which are reference data. Everything
  // about the region comes from the query: an app admin syncs none of that region's rows.
  const global = getGlobalState()

  const regionId = $derived(Number(page.params.regionId))
  // The query is kept alongside the resource: only it carries the status, and a refusal has to read
  // as a refusal rather than as something having gone wrong.
  const query = $derived(regionStats({ regionFk: regionId }))
  const stats = $derived(remoteResource(query))

  // The overview for a member; `/settings` for anyone else. Not `/regions`, which is app-admin
  // only: a refused viewer pressing back would land on a second refusal.
  // `userRegions` is the viewer's own membership, not region data, which is why this page may read it.
  const backHref = $derived(
    global.userRegions.some((region) => region.regionFk === regionId)
      ? entityHref('regions', regionId)
      : resolve('/settings'),
  )

  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current ? 0 : 150)

  // Admin first, the way a member list is read.
  const roles = [...assignableRoles].reverse()

  const count = $derived(new Intl.NumberFormat(getLocale()))
  const monthName = $derived(new Intl.DateTimeFormat(getLocale(), { month: 'long', timeZone: 'UTC', year: 'numeric' }))

  // Neither chart draws a value axis, so a picked bar has to say its own number somewhere. Both
  // read out in their section header, which is already on screen and does not move when it fills.
  let pickedGrade = $state<null | { count: number; label: string }>(null)
  let pickedMonth = $state<null | { count: number; month: number }>(null)

  // Two tiles a row on a phone, three from `sm`.
  const grid = 'grid grid-cols-2 gap-3 sm:grid-cols-3'
  // Members is four tiles: at three across the last one sits alone on a row of its own.
  const gridFour = 'grid grid-cols-2 gap-3 sm:grid-cols-4'
</script>

<svelte:head>
  <title>{stats.data?.name ?? m.region_stats()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(backHref)} title={stats.data?.name ?? m.region_stats()} />

<div class="container mx-auto max-w-3xl px-4 py-8 pb-24 md:pb-8">
  <QueryState resource={stats}>
    {#snippet error()}
      <div class="card preset-tonal-error px-4 py-3 text-sm" role="alert" in:fade={{ duration }}>
        {resolveErrorMessage(query.error)}
      </div>
    {/snippet}

    {#snippet ready(data)}
      {@const active = roles.reduce((total, role) => total + data.members[role], 0)}

      <div class="space-y-8">
        <SettingSection title={m.region_members()}>
          {#snippet aside()}
            {#if data.maxMembers > 0}
              <span class="text-surface-600-400 text-xs">
                {m.region_seatsUsed({ total: data.maxMembers, used: active + data.pendingInvitations })}
              </span>
            {/if}
          {/snippet}

          <dl class={gridFour}>
            {#each roles as role (role)}
              <StatTile label={roleLabel(role)} value={count.format(data.members[role])} />
            {/each}

            <StatTile label={m.region_statsPending()} value={count.format(data.pendingInvitations)} />
          </dl>
        </SettingSection>

        <SettingSection title={m.region_statsGuidebook()}>
          <dl class={grid}>
            <StatTile label={m.region_statsSectors()} value={count.format(data.sectors)} />
            <StatTile label={m.region_statsBlocks()} value={count.format(data.blocks)} />
            <StatTile label={m.region_statsRoutes()} value={count.format(data.routes)} />
            <StatTile label={m.region_statsUngraded()} value={count.format(data.ungraded)} />
            <StatTile label={m.region_statsNoTopo()} value={count.format(data.routesWithoutTopo)} />
            <StatTile label={m.region_statsNoCoordinates()} value={count.format(data.blocksWithoutCoordinates)} />
          </dl>
        </SettingSection>

        <SettingSection title={m.region_statsMedia()}>
          <dl class={grid}>
            <StatTile label={m.region_statsPhotos()} value={count.format(data.photos)} />
            <StatTile label={m.region_statsVideos()} value={count.format(data.videos)} />
          </dl>
        </SettingSection>

        {#if data.routes > 0}
          <SettingSection title={m.region_statsRoutesByGrade()}>
            {#snippet aside()}
              {#if pickedGrade != null}
                <span class="text-surface-600-400 text-xs" in:fade={{ duration }}>
                  {pickedGrade.label} · {m.routes_routesCount({ count: pickedGrade.count })}
                </span>
              {/if}
            {/snippet}

            <div class="border-surface-200-800 bg-surface-50-950 rounded-xl border p-4">
              <GradeHistogram
                countByGrade={data.gradeCounts}
                grades={global.grades}
                gradingScale={global.gradingScale}
                onselect={(bar) => (pickedGrade = bar == null ? null : { count: bar.count, label: bar.label })}
                ungraded={data.ungraded}
              />
            </div>
          </SettingSection>
        {/if}

        <SettingSection title={m.region_statsActivity()}>
          {#snippet aside()}
            {#if pickedMonth != null}
              <span class="text-surface-600-400 text-xs" in:fade={{ duration }}>
                {monthName.format(pickedMonth.month)} · {m.region_statsActivityCount({ count: pickedMonth.count })}
              </span>
            {/if}
          {/snippet}

          <dl class={grid}>
            <StatTile
              label="{m.region_statsAscents()} ({m.region_statsAllTime()})"
              value={count.format(data.ascents)}
            />
            <StatTile
              label="{m.region_statsContributors()} ({m.region_statsLastMonths()})"
              value={count.format(data.contributors)}
            />

            <!-- Never `createdAt` under the "last activity" label: a blank reads as a bug and a
                 stand-in date reads as a lie, so the label changes with the value. -->
            {#if data.lastActivityAt != null}
              <StatTile
                animate
                label={m.region_statsLastActivity()}
                value={formatUploadedAt(data.lastActivityAt, now(), getLocale())}
              />
            {:else}
              <StatTile
                animate
                label={m.region_createdAt()}
                value={formatUploadedAt(data.createdAt, now(), getLocale())}
              />
            {/if}
          </dl>

          <div class="border-surface-200-800 bg-surface-50-950 rounded-xl border p-4">
            <ActivityChart
              caption={data.lastActivityAt == null ? m.region_statsNoActivity() : m.region_statsActivityHint()}
              months={data.activityByMonth}
              onselect={(picked) => (pickedMonth = picked)}
            />
          </div>
        </SettingSection>
      </div>
    {/snippet}
  </QueryState>
</div>
