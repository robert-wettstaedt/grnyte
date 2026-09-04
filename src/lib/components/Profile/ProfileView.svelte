<script lang="ts">
  import { resolve } from '$app/paths'
  import ContributionCalendar from '$lib/components/ContributionCalendar/ContributionCalendar.svelte'
  import GradeHistogram from '$lib/components/GradeHistogram/GradeHistogram.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MediaLightbox from '$lib/components/Media/MediaLightbox.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import AscentRow from '$lib/entities/ascent/AscentRow.svelte'
  import { deriveProjects, type ProjectRoute } from '$lib/entities/ascent/projects'
  import { userAscentDetailList } from '$lib/entities/ascent/resources.svelte'
  import { dayCounts, groupSessions } from '$lib/entities/ascent/sessions'
  import { deriveStats, gradeCounts } from '$lib/entities/ascent/stats'
  import { ascentStatusByRoute } from '$lib/entities/ascent/status'
  import { userContributionCount } from '$lib/entities/event/events.remote'
  import { userFirstAscensionists } from '$lib/entities/firstAscensionist/resources.svelte'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { routeList, routesByIds } from '$lib/entities/route/resources.svelte'
  import { formatDay } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { now } from '$lib/state/now.svelte'
  import { locationCrumb } from './crumbs'
  import ProfileFavorites from './ProfileFavorites.svelte'
  import ProfileHeader from './ProfileHeader.svelte'
  import ProfileRouteList from './ProfileRouteList.svelte'
  import SectionHeading from './SectionHeading.svelte'

  interface Props {
    /** The signed-in user viewing their own profile. */
    isSelf: boolean
    /** When set (public profile), the header shows a back button. */
    onBack?: () => void
    userId: number
    username: string
  }

  const { isSelf, onBack, userId, username }: Props = $props()
  const global = getGlobalState()

  const ascents = userAscentDetailList(
    () => userId,
    () => true,
    () => isSelf,
  )
  // Guidebook contributions (areas/blocks/routes edited), counted server-side
  // rather than syncing the whole audit log only for a headline number.
  const contributions = $derived(userContributionCount(userId))

  const sessions = $derived(groupSessions(ascents.data))
  const calendarCounts = $derived(dayCounts(sessions))
  // Every ascent's media, newest upload first, so the fullscreen viewer can page
  // next/prev across the whole logbook from any thumbnail (recent sessions or a day sheet).
  const viewerFiles = $derived(ascents.data.flatMap((ascent) => ascent.files).sort((a, b) => b.createdAt - a.createdAt))
  const stats = $derived(deriveStats(ascents.data))

  // The headline counts sit outside the QueryState below, so nothing else stops them stating an
  // absence as a fact. Offline, somebody else's logbook is not kept and their tally is unknowable;
  // rendering it as 0 says they have never climbed.
  const ascentsUnavailable = $derived(ascents.availability === 'excluded' || ascents.availability === 'unsynced')
  const statusByRoute = $derived(ascentStatusByRoute(ascents.data))
  const projects = $derived(deriveProjects(ascents.data))
  const hardestGrade = $derived(gradeLabel(global.grades, global.gradingScale, stats.hardestGradeFk))

  // Grade histogram: all sends by default, narrowable to flashes.
  let flashOnly = $state(false)
  const histogramCounts = $derived(gradeCounts(ascents.data, flashOnly))

  // A tapped histogram bar (its routes) or calendar day (that day's ascents) opens
  // a bottom-sheet on mobile / centered dialog on desktop.
  let sheet = $state<
    null | { day: number; kind: 'day' } | { grade: { count: number; id: number; label: string }; kind: 'grade' }
  >(null)

  const selectedGradeId = $derived(sheet?.kind === 'grade' ? sheet.grade.id : null)
  const routeGrade = $derived(new Map(ascents.data.map((ascent) => [ascent.routeFk, ascent.routeGradeFk])))
  const gradeRouteIds = $derived.by(() => {
    if (selectedGradeId == null) {
      return []
    }
    const ids: number[] = []
    for (const [routeFk, type] of statusByRoute) {
      const counted = flashOnly ? type === 'flash' : type !== 'attempt'
      if (counted && routeGrade.get(routeFk) === selectedGradeId) {
        ids.push(routeFk)
      }
    }
    return ids
  })
  const gradeRoutes = routesByIds(() => gradeRouteIds)

  const daySession = $derived.by(() => {
    if (sheet?.kind !== 'day') {
      return null
    }
    const day = sheet.day
    return sessions.find((session) => session.day === day) ?? null
  })

  const sheetTitle = $derived(
    sheet?.kind === 'grade' ? sheet.grade.label : sheet?.kind === 'day' ? formatDay(sheet.day, now(), getLocale()) : '',
  )
  const sheetSubtitle = $derived(
    sheet?.kind === 'grade'
      ? m.routes_routesCount({ count: sheet.grade.count })
      : daySession != null
        ? m.profile_climbsCount({ count: daySession.ascents.length })
        : undefined,
  )

  // Projects: classify from ascents, sort by the chosen key, hydrate route rows by id.
  let sortMode = $state<'date' | 'sessions'>('date')
  const sortProjects = (list: ProjectRoute[]): ProjectRoute[] =>
    [...list].sort(
      sortMode === 'sessions'
        ? (a, b) => b.sessions - a.sessions || b.lastSession - a.lastSession
        : (a, b) => b.lastSession - a.lastSession,
    )
  const openSorted = $derived(sortProjects(projects.open))
  const completedSorted = $derived(sortProjects(projects.completed))
  const openIds = $derived(openSorted.map((project) => project.routeFk))
  const completedIds = $derived(completedSorted.map((project) => project.routeFk))
  const openRoutes = routesByIds(() => openIds)
  const completedRoutes = routesByIds(() => completedIds)
  const projectByRoute = $derived(new Map([...openSorted, ...completedSorted].map((p) => [p.routeFk, p])))
  const projectCrumb = (route: { id: number }): string[] => {
    const project = projectByRoute.get(route.id)
    return project == null ? [] : [m.profile_sessionsCount({ count: project.sessions })]
  }

  // First ascents: resolve the user's FA rows, then list routes filtered by their ids.
  const fa = userFirstAscensionists(() => userId)
  const faIds = $derived(fa.data.map((row) => row.id))
  // A person's names read as a sentence, so they need the language's conjunction, and where the
  // comma goes differs per language: "Ann, Bo, and Cy" in English (serial comma) against
  // "Ann, Bo und Cy" in German (no comma before "und"). $derived so the formatter is built once per
  // locale, as in ContributionCalendar.
  const nameList = $derived(new Intl.ListFormat(getLocale(), { style: 'long', type: 'conjunction' }))
  const faName = $derived(nameList.format(fa.data.map((row) => row.name)))
  const faRoutes = routeList(() => ({ firstAscensionists: faIds, sort: 'firstAscentYear', sortOrder: 'desc' }), {
    enabled: () => faIds.length > 0,
  })

  const SESSION_STEP = 6
  let sessionLimit = $state(SESSION_STEP)
</script>

{#snippet gradeFilter()}
  <!-- A boolean filter: two buttons styled as a segmented toggle. -->
  <div class="bg-surface-200-800 inline-flex rounded-lg p-0.5 text-xs font-semibold">
    <button
      type="button"
      class={['rounded-md px-3 py-1', flashOnly ? 'text-surface-600-400' : 'bg-surface-50-950 shadow-sm']}
      aria-pressed={!flashOnly}
      onclick={() => ((flashOnly = false), (sheet = null))}
    >
      {m.profile_allSends()}
    </button>
    <button
      type="button"
      class={['rounded-md px-3 py-1', flashOnly ? 'bg-surface-50-950 shadow-sm' : 'text-surface-600-400']}
      aria-pressed={flashOnly}
      onclick={() => ((flashOnly = true), (sheet = null))}
    >
      {m.profile_flashes()}
    </button>
  </div>
{/snippet}

{#snippet sortToggle()}
  <!-- Sorting, not filtering: a labelled text toggle (leading sort glyph), visually
       distinct from the histogram's segmented filter pill above. -->
  <div class="text-surface-500 flex items-center gap-1.5 text-xs font-semibold">
    <Icon name="arrow-up-down" size={14} />
    <button
      type="button"
      class={sortMode === 'date' ? 'text-primary-500' : 'hover:text-surface-700-300'}
      aria-pressed={sortMode === 'date'}
      onclick={() => (sortMode = 'date')}
    >
      {m.profile_sortRecent()}
    </button>
    <span aria-hidden="true" class="text-surface-400-600">·</span>
    <button
      type="button"
      class={sortMode === 'sessions' ? 'text-primary-500' : 'hover:text-surface-700-300'}
      aria-pressed={sortMode === 'sessions'}
      onclick={() => (sortMode = 'sessions')}
    >
      {m.profile_sortSessions()}
    </button>
  </div>
{/snippet}

<div class="container mx-auto max-w-3xl space-y-8 px-4 py-8 pb-24 md:pb-8">
  <ProfileHeader
    {username}
    {faName}
    {stats}
    {hardestGrade}
    {isSelf}
    {onBack}
    contributions={contributions.current}
    unavailable={ascentsUnavailable}
  />

  <!-- First run: every number above reads zero and every section below is missing, so the page
       needs one thing to do. Outside the QueryState on purpose - with no ascents it renders its
       `empty` branch, so anything nested in `ready` would never show on the one profile that
       needs this. Own profile only, and gone the moment anything is logged. -->
  {#if isSelf && ascents.isEmpty}
    <a
      class="border-primary-500/30 bg-primary-500/10 hover:bg-primary-500/15 flex items-center gap-3 rounded-2xl border p-3.5 transition-colors"
      href={resolve('/(app)/(shell)/(explore)/(map)/search')}
    >
      <span class="bg-primary-500/20 text-primary-700-300 flex size-9 flex-none items-center justify-center rounded-xl">
        <Icon name="trending-up" size={19} />
      </span>

      <span class="min-w-0 flex-1">
        <span class="block text-sm font-semibold">{m.profile_firstAscentNudge()}</span>
        <span class="text-surface-600-400 block text-xs text-pretty">{m.profile_firstAscentNudgeBody()}</span>
      </span>

      <Icon name="chevron-right" size={18} class="text-surface-500 flex-none" />
    </a>
  {/if}

  <QueryState resource={ascents}>
    {#snippet ready()}
      <div class="space-y-8">
        <!-- Activity heatmap -->
        {#if sessions.length > 0}
          <section class="space-y-2.5">
            <SectionHeading title={m.profile_activity()} />
            <ContributionCalendar
              counts={calendarCounts}
              onselect={(cell) => {
                if (cell == null) {
                  if (sheet?.kind === 'day') sheet = null
                } else if (cell.count > 0) {
                  sheet = { day: cell.day, kind: 'day' }
                }
              }}
            />
          </section>
        {/if}

        <!-- Grade histogram, with an all-sends / flash toggle -->
        {#if stats.sends > 0}
          <section class="space-y-2.5">
            <SectionHeading title={m.profile_gradePyramid()} action={gradeFilter} />
            <GradeHistogram
              countByGrade={histogramCounts}
              grades={global.grades}
              gradingScale={global.gradingScale}
              onselect={(bar) => (sheet = bar == null ? null : { grade: bar, kind: 'grade' })}
              showCounts
            />
          </section>
        {/if}

        <!-- Recent sessions grouped by day -->
        {#if sessions.length > 0}
          <section class="space-y-3">
            <SectionHeading title={m.profile_recentSessions()} />
            {#each sessions.slice(0, sessionLimit) as session (session.day)}
              <div class="space-y-1.5">
                <h3 class="text-surface-500 text-xs font-semibold">{formatDay(session.day, now(), getLocale())}</h3>
                {#each session.ascents as ascent (ascent.id)}
                  <AscentRow
                    {ascent}
                    crumbs={locationCrumb(ascent)}
                    routeName={ascent.routeName}
                    route={{
                      href: resolve('/(app)/routes/[id]', { id: String(ascent.routeFk) }),
                      name: ascent.routeName,
                    }}
                  />
                {/each}
              </div>
            {/each}
            {#if sessions.length > sessionLimit}
              <button
                type="button"
                class="btn preset-tonal-surface w-full"
                onclick={() => (sessionLimit += SESSION_STEP)}
              >
                {m.common_showMore()}
              </button>
            {/if}
          </section>
        {/if}

        <!-- Open projects -->
        {#if projects.open.length > 0}
          <section class="space-y-2.5">
            <SectionHeading title={m.profile_openProjects()} action={sortToggle} />
            <ProfileRouteList
              resource={openRoutes}
              order={openIds}
              status={statusByRoute}
              crumbFor={projectCrumb}
              emptyText={m.profile_noProjects()}
            />
          </section>
        {/if}

        <!-- Completed projects -->
        {#if projects.completed.length > 0}
          <section class="space-y-2.5">
            <SectionHeading title={m.profile_completedProjects()} action={sortToggle} />
            <ProfileRouteList
              resource={completedRoutes}
              order={completedIds}
              status={statusByRoute}
              crumbFor={projectCrumb}
              emptyText={m.profile_noProjects()}
            />
          </section>
        {/if}
      </div>
    {/snippet}

    {#snippet empty()}
      <p class="text-surface-600-400 py-8 text-center text-sm">{m.profile_noAscents()}</p>
    {/snippet}
  </QueryState>

  <!-- First ascents (public) -->
  {#if faIds.length > 0}
    <section class="space-y-2.5">
      <SectionHeading title={m.profile_firstAscents()} />
      <ProfileRouteList
        resource={faRoutes}
        status={statusByRoute}
        crumbFor={locationCrumb}
        emptyText={m.profile_noFirstAscents()}
      />
    </section>
  {/if}

  <ProfileFavorites {userId} {isSelf} status={statusByRoute} />

  <!-- Detail sheet: routes behind a tapped histogram bar, or a tapped day's ascents
       (with their media). Bottom-sheet on mobile, centered dialog on desktop. -->
  <Modal
    bind:open={
      () => sheet !== null,
      (value) => {
        if (!value) sheet = null
      }
    }
    backdrop
    panel
    panelClass="fixed inset-0 z-50 flex items-center justify-center p-4"
    contentClass="w-full max-w-md max-h-[80dvh]"
    snapPoints={[0.6]}
    subtitle={sheetSubtitle}
    title={sheetTitle}
  >
    {#snippet trigger()}{/snippet}

    {#if sheet?.kind === 'grade'}
      <ProfileRouteList resource={gradeRoutes} status={statusByRoute} limit={50} emptyText={m.profile_noAscents()} />
    {:else if daySession != null}
      <div class="flex flex-col gap-1.5">
        {#each daySession.ascents as ascent (ascent.id)}
          <AscentRow
            {ascent}
            crumbs={locationCrumb(ascent)}
            routeName={ascent.routeName}
            route={{ href: resolve('/(app)/routes/[id]', { id: String(ascent.routeFk) }), name: ascent.routeName }}
          />
        {/each}
      </div>
    {/if}
  </Modal>

  <!-- The one fullscreen viewer host for every logbook thumbnail (sessions + day sheet);
       a tapped thumb sets ?media, this opens it. Ascent rows live outside any grid. -->
  <MediaLightbox items={viewerFiles} />
</div>
