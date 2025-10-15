<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import FileViewer from '$lib/components/FileViewer'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { queries } from '$lib/db/zero'

  interface Props {
    entityId: number
    entityType: 'area' | 'ascent' | 'route'
    regionFk: number
  }

  const { entityId, entityType, regionFk }: Props = $props()
</script>

<ZeroQueryWrapper
  loadingIndicator={{ count: 1, height: 'h-50 md:h-90', type: 'skeleton' }}
  query={queries.listFiles(page.data.session, { entity: { type: entityType, id: entityId } })}
>
  {#snippet children(files)}
    {#if entityType === 'route'}
      <ZeroQueryWrapper
        query={queries.listAscents(page.data.session, { routeId: entityId, types: ['flash', 'repeat', 'send'] })}
      >
        {#snippet children(ascents)}
          {@const allFiles = [...files, ...ascents.flatMap((ascent) => ascent.files)]}

          {#if allFiles.length > 0}
            <div class="flex p-2">
              <span class="flex-auto">
                <dt>Files</dt>
                <dd class="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {#each allFiles as file}
                    <FileViewer
                      {file}
                      readOnly={!checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], regionFk)}
                    />
                  {/each}
                </dd>
              </span>
            </div>
          {/if}
        {/snippet}
      </ZeroQueryWrapper>
    {:else if files.length > 0}
      <div class="flex p-2">
        <span class="flex-auto">
          <dt>Files</dt>
          <dd class="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            {#each files as file}
              <FileViewer
                {file}
                readOnly={!checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], regionFk)}
              />
            {/each}
          </dd>
        </span>
      </div>
    {/if}
  {/snippet}
</ZeroQueryWrapper>
