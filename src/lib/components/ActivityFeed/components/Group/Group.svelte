<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import FileViewer from '$lib/components/FileViewer'
  import { pageState } from '$lib/components/Layout'
  import type { ActivityGroup } from '../..'
  import Item, { ItemLoader } from '../Item'

  interface Props {
    group: ActivityGroup
  }

  const { group }: Props = $props()

  let hasBeenOpened = $state(0)
</script>

<ItemLoader activity={group.items[0]}>
  {#snippet children(activity)}
    {#if group.items.length === 1}
      <Item {activity} withDetails withFiles />
    {:else}
      <div class="card bg-base-200 group/feed-group hover:bg-base-300 transition-colors">
        <div class="card-body">
          <div class="flex items-start gap-4">
            <div class="min-w-0 flex-1">
              <Item {activity} withFiles={false} withDetails />

              <div class="ms-14">
                {#if group.files.length > 0}
                  <div
                    class="mt-4 grid gap-3 {group.files.length === 1
                      ? 'grid-cols-1 md:grid-cols-2'
                      : 'grid-cols-2 md:grid-cols-4'}"
                  >
                    {#each group.files as file}
                      <FileViewer
                        {file}
                        readOnly={!(
                          checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], file.regionFk) ||
                          file.ascent?.createdBy === pageState.user?.id
                        )}
                      />
                    {/each}
                  </div>
                {/if}

                <details class="mt-4" ontoggle={(event) => (hasBeenOpened |= Number(event.currentTarget.open))}>
                  <summary class="hover:text-primary-500 cursor-pointer transition-colors">
                    Show {group.items.length - 1} more change{group.items.length - 1 === 1 ? '' : 's'}
                  </summary>

                  {#if hasBeenOpened}
                    <div class="border-surface-200-800 -ms-10 mt-4 space-y-4 border-l-2 pl-2 md:ms-0">
                      {#each group.items.slice(1) as activity}
                        <ItemLoader {activity}>
                          {#snippet children(activity)}
                            <Item {activity} withFiles={false} withDetails />
                          {/snippet}
                        </ItemLoader>
                      {/each}
                    </div>
                  {/if}
                </details>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/snippet}
</ItemLoader>
