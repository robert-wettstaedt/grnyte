<script lang="ts">
  import { page } from '$app/state'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import type { Schema } from '$lib/db/zero'
  import { validateObject } from '$lib/forms/validate.svelte'
  import type { PullRow } from '@rocicorp/zero'
  import { compareDesc, format, isWithinInterval, sub, type Interval } from 'date-fns'
  import { z } from 'zod'
  import type { ActivityGroup, ActivityWithDate } from '.'
  import ActivityFeed, { PAGE_SIZE } from '.'

  interface Props {
    entity?: {
      id: NonNullable<PullRow<'activities', Schema>['parentEntityId']>
      type: NonNullable<PullRow<'activities', Schema>['parentEntityType']>
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

    let query = page.data.z.current.query.activities
      .limit(searchParams.pageSize)
      .where(({ and, or, cmp }) => {
        if (entity == null) {
          return and()
        }

        return or(
          and(cmp('entityId', entity.id), cmp('entityType', entity.type)),
          and(cmp('parentEntityId', entity.id), cmp('parentEntityType', entity.type)),
        )
      })
      .orderBy('createdAt', 'desc')

    if (searchParams.user === 'me' && page.data.user != null) {
      query = query.where('userFk', page.data.user.id)
    }

    if (searchParams.type === 'ascents') {
      query = query.where('entityType', 'ascent').where('type', 'created')
    }

    return query
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

  function paginateActivities(activities: PullRow<'activities', Schema>[]) {
    const pages = Math.ceil(activities.length / PAGE_SIZE)
    const paginatedActivities: PullRow<'activities', Schema>[][] = []

    for (let index = 0; index < pages; index++) {
      paginatedActivities.push(activities.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE))
    }

    return paginatedActivities
  }

  function groupActivities(_activities: PullRow<'activities', Schema>[], files: ActivityGroup['files']) {
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

<ZeroQueryWrapper {query}>
  {#snippet children(items)}
    {@const fileIds = items.filter((activity) => activity.entityType === 'file').map((activity) => activity.entityId)}
    <ZeroQueryWrapper query={page.data.z.current.query.files.where('id', 'IN', fileIds).related('ascent')}>
      {#snippet children(files)}
        {@const groups = paginateActivities(items).map((item) => groupActivities(item, files))}
        <ActivityFeed activities={groups} />
      {/snippet}
    </ZeroQueryWrapper>
  {/snippet}
</ZeroQueryWrapper>
