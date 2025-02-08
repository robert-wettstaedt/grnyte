<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { DELETE_PERMISSION } from '$lib/auth'
  import ObjectViewer from '$lib/components/ObjectViewer'
  import RouteName from '$lib/components/RouteName'
  import type { Pagination } from '$lib/pagination.server'
  import type { ObjectDTO } from '$lib/storage.server'
  import { formatRelative } from 'date-fns'
  import { enGB as locale } from 'date-fns/locale'
  import type { ActivityDTO, ActivityGroup } from '.'
  import type { ItemProps } from './components/Item'
  import Item from './components/Item'

  interface Props extends Pick<ItemProps, 'withBreadcrumbs'> {
    activities: ActivityGroup[]
    pagination: Pagination
  }

  const { activities, pagination, ...rest }: Props = $props()

  console.log(activities)

  let activityPages = $state<(typeof activities)[]>([])
  let prevPage = $state(1)
  let activityType = $state('all')

  afterNavigate(() => {
    if (pagination.page === prevPage + 1) {
      activityPages.push(activities)

      if (activityPages.length > 1) {
        requestAnimationFrame(() => {
          document.querySelector(`#feed-${activityPages.length}`)?.scrollIntoView({ behavior: 'smooth' })
        })
      }
    } else {
      activityPages = [activities]
    }

    prevPage = pagination.page
    activityType = $page.url.searchParams.get('type') ?? 'all'
  })

  function getUniqueFiles(group: ActivityGroup): ObjectDTO[] {
    return group.items
      .filter(
        (
          activity,
        ): activity is ActivityDTO & {
          entity: {
            type: 'ascent'
            object: {
              files: ObjectDTO[]
              createdBy: number
            }
          }
        } =>
          activity.entity.type === 'ascent' &&
          activity.entity.object != null &&
          'files' in activity.entity.object &&
          Array.isArray(activity.entity.object.files),
      )
      .flatMap((activity) => activity.entity.object.files)
      .filter((file, index, self) => index === self.findIndex((f) => f.id === file.id))
  }

  function findAscentForFile(group: ActivityGroup, fileId: number) {
    const activity = group.items.find(
      (
        activity,
      ): activity is ActivityDTO & {
        entity: {
          type: 'ascent'
          object: {
            files: ObjectDTO[]
            createdBy: number
          }
        }
      } =>
        activity.entity.type === 'ascent' &&
        activity.entity.object != null &&
        'files' in activity.entity.object &&
        Array.isArray(activity.entity.object.files) &&
        activity.entity.object.files.some((f) => f.id === fileId),
    )
    return activity
  }
</script>

<label class="label flex flex-col sm:flex-row sm:items-center gap-2">
  <span class="label-text font-medium">Filter activity feed:</span>
  <select
    class="select select-bordered w-full sm:w-auto"
    onchange={(event) => {
      const url = new URL($page.url)

      const activityType = (event.target as HTMLSelectElement).value
      if (activityType === 'ascents') {
        url.searchParams.set('type', activityType)
      } else {
        url.searchParams.delete('type')
      }

      url.searchParams.delete('page')
      goto(url)
    }}
    value={activityType}
  >
    <option value="all">Show all activity</option>
    <option value="ascents">Show ascents only</option>
  </select>
</label>

{#each activityPages as activities, i}
  <div class="mt-8" id="feed-{i + 1}">
    {#if activities.length === 0}
      <p class="text-center opacity-75">No recent activity</p>
    {:else}
      <div class="space-y-8">
        {#each activities as group}
          {#if group.items.length === 1}
            <Item activity={group.items[0]} withDetails withFiles={true} {...rest} />
          {:else}
            <div class="card bg-base-200 group/feed-group hover:bg-base-300 transition-colors">
              <div class="card-body">
                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 rounded-full bg-surface-200-800 flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-layer-group text-lg"></i>
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="mb-2">
                      <span class="font-semibold">
                        <a class="anchor" href={`/users/${group.user?.username}`}>{group.user?.username}</a>
                      </span>

                      {#if group.parentEntity != null}
                        <span>
                          updated

                          {#if rest.withBreadcrumbs && group.parentEntity?.breadcrumb != null}
                            {#each group.parentEntity?.breadcrumb as crumb, i}
                              <span class="inline-flex text-surface-500">{crumb}</span>

                              <span class="text-surface-500 mx-1 text-sm" aria-hidden="true">&gt;</span>
                            {/each}
                          {/if}

                          <a
                            class="anchor font-medium inline-flex max-w-full whitespace-nowrap overflow-hidden text-ellipsis"
                            href={`/${group.parentEntity.type}s/${group.parentEntity.object?.id}`}
                          >
                            {#if group.parentEntity.type === 'route' && group.parentEntity.object != null}
                              <RouteName route={group.parentEntity.object} />
                            {:else if group.parentEntity.object != null && 'name' in group.parentEntity.object}
                              {group.parentEntity.object.name}
                            {/if}
                          </a>
                        </span>
                      {:else}
                        <span>
                          updated
                          <a
                            class="anchor font-medium inline-flex max-w-full whitespace-nowrap overflow-hidden text-ellipsis"
                            href={`/${group.entity.type}s/${group.entity.object?.id}`}
                          >
                            {#if group.entity.type === 'route' && group.entity.object != null}
                              <RouteName route={group.entity.object} />
                            {:else if group.entity.object != null && 'name' in group.entity.object}
                              {group.entity.object.name}
                            {/if}
                          </a>
                        </span>
                      {/if}
                    </div>

                    <p class="text-sm text-surface-500">
                      {formatRelative(new Date(group.latestDate), new Date(), { locale })}
                    </p>

                    {#if group.items.some((activity) => activity.entity.type === 'ascent' && activity.entity.object?.files != null && activity.entity.object.files.length > 0)}
                      <div class="mt-4">
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {#each getUniqueFiles(group) as object}
                            {#if object.stat != null}
                              {@const ascentActivity = findAscentForFile(group, object.id)}

                              <ObjectViewer
                                {object}
                                readOnly={!$page.data.userPermissions?.includes(DELETE_PERMISSION) ||
                                  ascentActivity?.entity.object?.createdBy !== $page.data.user?.id}
                                onDelete={() => {
                                  if (ascentActivity?.entity.object != null) {
                                    ascentActivity.entity.object.files = ascentActivity.entity.object.files.filter(
                                      (f) => f.id !== object.id,
                                    )
                                  }
                                }}
                              />
                            {/if}
                          {/each}
                        </div>
                      </div>
                    {/if}

                    <details class="mt-4">
                      <summary class="cursor-pointer hover:text-primary-500 transition-colors">
                        Show {group.items.length} changes
                      </summary>
                      <div class="space-y-4 mt-4 pl-2 border-l-2 border-surface-200-800">
                        {#each group.items as activity}
                          <Item {activity} withFiles={false} />
                        {/each}
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/each}

<div class="flex justify-center my-16">
  <button
    class="btn preset-outlined-primary-500"
    disabled={pagination.page >= pagination.totalPages}
    onclick={() => {
      const nextPage = pagination.page + 1
      const url = new URL($page.url)
      url.searchParams.set('page', String(nextPage))
      goto(url)
    }}
  >
    Load more activities
  </button>
</div>
