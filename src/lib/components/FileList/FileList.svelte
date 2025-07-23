<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import FileViewer from '$lib/components/FileViewer'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'

  interface Props {
    entityId: number
    entityType: 'area' | 'ascent' | 'route'
    regionFk: number
  }

  const { entityId, entityType, regionFk }: Props = $props()
</script>

<ZeroQueryWrapper
  query={page.data.z.current.query.files.where(
    entityType === 'area' ? 'areaFk' : entityType === 'ascent' ? 'ascentFk' : 'routeFk',
    entityId,
  )}
>
  {#snippet children(files)}
    {#if files.length > 0}
      <div class="flex p-2">
        <span class="flex-auto">
          <dt>Files</dt>
          <dd class="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            {#each files as file}
              <FileViewer
                {file}
                readOnly={!checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_DELETE], regionFk)}
              />
            {/each}
          </dd>
        </span>
      </div>
    {/if}
  {/snippet}
</ZeroQueryWrapper>
