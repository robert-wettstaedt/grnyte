<script lang="ts" module>
  export interface ActivityFeedProps extends Pick<ItemProps, 'withBreadcrumbs'> {
    activities: ActivityGroup[]
    pagination: Pagination
    onMount?: (updater: (activities: ActivityGroup[]) => void) => void
  }
</script>

<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import FileViewer from '$lib/components/FileViewer'
  import RouteName from '$lib/components/RouteName'
  import type { FileDTO } from '$lib/nextcloud'
  import type { Pagination } from '$lib/pagination.server'
  import { formatRelative } from 'date-fns'
  import { enGB as locale } from 'date-fns/locale'
  import { onMount } from 'svelte'
  import type { ActivityDTO, ActivityGroup } from '.'
  import type { ItemProps } from './components/Item'
  import Item from './components/Item'

  const { activities, pagination, onMount: propsOnMount, ...rest }: ActivityFeedProps = $props()

  let activityPages = $state<(typeof activities)[]>([])
  let prevPage = $state(1)
  let filterValue = $state<string[]>([])

  onMount(() => {
    propsOnMount?.((newActivities) => {
      activityPages = [newActivities]
    })
  })

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
    filterValue = Array.from(page.url.searchParams.entries()).map(([key, value]) => `${key}=${value}`)
  })

  function getUniqueFiles(group: ActivityGroup): FileDTO[] {
    return group.items
      .filter(
        (
          activity,
        ): activity is ActivityDTO & {
          entity: {
            type: 'ascent'
            object: {
              files: FileDTO[]
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
      .filter((file, index, self) => index === self.findIndex((f: FileDTO) => f.id === file.id))
  }

  function findAscentForFile(group: ActivityGroup, fileId: string) {
    const activity = group.items.find(
      (
        activity,
      ): activity is ActivityDTO & {
        entity: {
          type: 'ascent'
          object: {
            files: FileDTO[]
            createdBy: number
          }
        }
      } =>
        activity.entity.type === 'ascent' &&
        activity.entity.object != null &&
        'files' in activity.entity.object &&
        Array.isArray(activity.entity.object.files) &&
        activity.entity.object.files.some((f: FileDTO) => f.id === fileId),
    )
    return activity
  }
</script>

<label class="label flex flex-col gap-2">
  <span class="label-text font-medium">Filter activity feed:</span>
  <select
    class="select select-bordered w-full sm:w-60"
    multiple
    onchange={(event) => {
      const selectedOptions = (event.target as HTMLSelectElement).selectedOptions
      const selectedValues = Array.from(selectedOptions).map((option) => option.value)

      const url = new URL(page.url)
      url.searchParams.delete('type')
      url.searchParams.delete('user')
      selectedValues.forEach((selectedValue) => {
        const [key, value] = selectedValue.split('=')
        url.searchParams.append(key, value)
      })
      goto(url)
    }}
    size="2"
    value={filterValue}
  >
    <option value="type=ascents">Show ascents only</option>
    <option value="user=me">Show my activity only</option>
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
                  <div class="bg-surface-200-800 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
                    <i class="fa-solid fa-layer-group text-lg"></i>
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="mb-2">
                      <span class="font-semibold">
                        <a class="anchor" href={`/users/${group.user?.username}`}>{group.user?.username}</a>
                      </span>

                      {#if group.parentEntity != null}
                        <span>
                          updated

                          {#if rest.withBreadcrumbs && group.parentEntity?.breadcrumb != null}
                            {#each group.parentEntity?.breadcrumb as crumb, i}
                              <span class="text-surface-500 inline-flex">{crumb}</span>

                              <span class="text-surface-500 mx-1 text-sm" aria-hidden="true">&gt;</span>
                            {/each}
                          {/if}

                          <a
                            class="anchor inline-flex max-w-full overflow-hidden font-medium text-ellipsis whitespace-nowrap"
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
                            class="anchor inline-flex max-w-full overflow-hidden font-medium text-ellipsis whitespace-nowrap"
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

                    <p class="text-surface-500 text-sm">
                      {formatRelative(new Date(group.latestDate), new Date(), { locale })}
                    </p>

                    {#if group.items.some((activity) => activity.entity.type === 'ascent' && activity.entity.object?.files != null && activity.entity.object.files.length > 0)}
                      <div
                        class="mt-4 grid gap-3 {getUniqueFiles(group).length === 1
                          ? 'grid-cols-1 md:grid-cols-2'
                          : 'grid-cols-2 md:grid-cols-4'}"
                      >
                        {#each getUniqueFiles(group) as file}
                          {#if file.stat != null}
                            {@const ascentActivity = findAscentForFile(group, file.id)}

                            <FileViewer
                              {file}
                              stat={file.stat}
                              readOnly={!(
                                checkRegionPermission(
                                  page.data.userRegions,
                                  [REGION_PERMISSION_ADMIN],
                                  file.regionFk,
                                ) || ascentActivity?.entity.object?.createdBy === page.data.user?.id
                              )}
                              onDelete={() => {
                                if (ascentActivity?.entity.object != null) {
                                  ascentActivity.entity.object.files = ascentActivity.entity.object.files.filter(
                                    (f) => f.id !== file.id,
                                  )
                                }
                              }}
                            />
                          {/if}
                        {/each}
                      </div>
                    {/if}

                    <details class="mt-4">
                      <summary class="hover:text-primary-500 cursor-pointer transition-colors">
                        Show {group.items.length} changes
                      </summary>
                      <div class="border-surface-200-800 mt-4 space-y-4 border-l-2 pl-2">
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

<div class="my-16 flex justify-center">
  <button
    class="btn preset-outlined-primary-500"
    disabled={pagination.page >= pagination.totalPages}
    onclick={() => {
      const nextPage = pagination.page + 1
      const url = new URL(page.url)
      url.searchParams.set('page', String(nextPage))
      goto(url)
    }}
  >
    Load more activities
  </button>
</div>
