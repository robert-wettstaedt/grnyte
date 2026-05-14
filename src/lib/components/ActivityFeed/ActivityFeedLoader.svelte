<script lang="ts">
  import { page } from '$app/state'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { queries, type Row, type RowWithRelations } from '$lib/db/zero'
  import { validateObject } from '$lib/forms/validate.svelte'
  import { compareDesc, format, isWithinInterval, sub, type Interval } from 'date-fns'
  import { z } from 'zod'
  import type { ActivityGroup, ActivityWithDate } from '.'
  import ActivityFeed, { PAGE_SIZE } from '.'

  interface Props {
    entity?: {
      id: NonNullable<Row<'activities'>['parentEntityId']>
      type: NonNullable<Row<'activities'>['parentEntityType']>
    }
  }

  const { entity }: Props = $props()

  const searchParamsSchema = z.object({
    pageSize: z.number().default(PAGE_SIZE),
    type: z.enum(['all', 'ascents']).optional(),
    user: z.enum(['all', 'me']).optional(),
  })

  const query = $derived.by(() => {
    const searchParamsObj = Object.fromEntries(page.url.searchParams.entries())
    const searchParams = validateObject(searchParamsSchema, searchParamsObj)

    return queries.activities({
      pageSize: searchParams.pageSize,
      entity: searchParams.type === 'ascents' ? { type: 'ascent' } : entity,
      type: searchParams.type === 'ascents' ? 'created' : undefined,
      userFk: searchParams.user === 'me' && pageState.user?.id != null ? pageState.user.id : undefined,
    })
  })

  function groupByUser(activities: ActivityWithDate[], files: ActivityGroup['files']) {
    const userFks = Array.from(new Set(activities.map((activity) => activity.userFk)))

    return userFks.map((userFk): ActivityGroup => {
      const groupActivities = activities.filter((activity) => activity.userFk === userFk)
      const groupFiles = files.filter((file) =>
        groupActivities.some((activity) => activity.entityType === 'file' && activity.entityId === file.id),
      )

      return {
        date: activities[0].createdAtDate,
        files: groupFiles,
        items: groupActivities,
        userFk,
      }
    })
  }

  function paginateActivities(activities: RowWithRelations<'activities', { user: true }>[]) {
    const pages = Math.ceil(activities.length / PAGE_SIZE)
    const paginatedActivities: RowWithRelations<'activities', { user: true }>[][] = []

    for (let index = 0; index < pages; index++) {
      paginatedActivities.push(activities.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE))
    }

    return paginatedActivities
  }

  function groupActivities(
    _activities: RowWithRelations<'activities', { user: true }>[],
    files: ActivityGroup['files'],
  ) {
    let activities = [..._activities]
      .filter((activity) => activity.createdAt != null)
      .map((activity) => ({ ...activity, createdAtDate: new Date(activity.createdAt!) }))

    const now = new Date()
    const intervals: Interval[] = [
      { start: sub(now, { minutes: 30 }), end: now },
      { start: sub(now, { hours: 3 }), end: now },
      { start: sub(now, { hours: 12 }), end: now },
      { start: sub(now, { hours: 23 }), end: now },
      ...new Array(29).fill(0).map((_, i) => {
        const start = sub(now, { days: i + 1 })
        return { start, end: now }
      }),
      ...new Array(11).fill(0).map((_, i) => {
        const start = sub(now, { months: i + 1 })
        return { start, end: now }
      }),
    ]

    const groupsByIntervals = intervals.flatMap((interval) => {
      const activitiesInInterval = activities.filter((activity) => isWithinInterval(activity.createdAtDate, interval))
      activities = activities.filter((activity) => !activitiesInInterval.some((a) => a.id === activity.id))

      return groupByUser(activitiesInInterval, files)
    })

    const remainingYears = Array.from(new Set(activities.map((activity) => format(activity.createdAtDate, 'yyyy'))))
    const groupsByYears = remainingYears.flatMap((day) => {
      const activitiesByYear = activities.filter((activity) => format(activity.createdAtDate, 'yyyy') === day)
      return groupByUser(activitiesByYear, files)
    })

    return [...groupsByIntervals, ...groupsByYears].toSorted((a, b) => compareDesc(a.date, b.date))
  }
</script>

<ZeroQueryWrapper {query} loadingIndicator={{ type: 'skeleton', count: 15 }}>
  {#snippet children(items)}
    {@const fileId = items.filter((activity) => activity.entityType === 'file').map((activity) => activity.entityId)}
    <ZeroQueryWrapper query={queries.listFiles({ fileId })}>
      {#snippet children(files)}
        {@const groups = paginateActivities(items).map((item) => groupActivities(item, files))}
        <ActivityFeed activities={groups} />
      {/snippet}
    </ZeroQueryWrapper>
  {/snippet}
</ZeroQueryWrapper>
