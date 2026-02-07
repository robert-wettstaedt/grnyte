<script lang="ts" module>
  export interface ItemProps {
    activity: ActivityDTO
    withBreadcrumbs?: boolean
    withDetails?: boolean
    withFiles?: boolean
  }
</script>

<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import FileViewer from '$lib/components/FileViewer'
  import { pageState } from '$lib/components/Layout'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import { getI18n } from '$lib/i18n'
  import { formatRelative } from 'date-fns'
  import { de, enGB } from 'date-fns/locale'
  import type { ActivityDTO } from '../../'
  import Sentence from '../Sentence'

  const { activity, withBreadcrumbs = false, withDetails = false, withFiles = false }: ItemProps = $props()

  const { language } = $derived(getI18n())

  const locale = $derived(language === 'de' ? de : enGB)

  const iconClasses = $derived.by(() => {
    if (activity.entity.type === 'ascent' && activity.entity.object != null && activity.type === 'created') {
      switch (activity.entity.object.type) {
        case 'flash':
          return 'fa-bolt-lightning text-yellow-300'
        case 'send':
          return 'fa-circle text-red-500'
        case 'repeat':
          return 'fa-repeat text-green-500'
        default:
          return 'fa-person-falling text-blue-300'
      }
    }

    if (activity.type === 'created' && activity.columnName === 'favorite') {
      return 'fa-heart text-red-500'
    }

    if (activity.type === 'deleted' && activity.columnName === 'favorite') {
      return 'fa-heart-crack text-white'
    }

    switch (activity.type) {
      case 'created':
        return 'fa-plus'
      case 'uploaded':
        return 'fa-upload'
      case 'deleted':
        return 'fa-trash'
      default:
        return 'fa-pen'
    }
  })
</script>

<div class="flex items-start gap-4">
  <div class="bg-surface-200-800 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
    <i class="fa-solid {iconClasses} text-lg"></i>
  </div>

  <div class="min-w-0 flex-1 overflow-hidden">
    <div class="mb-2">
      <Sentence {activity} {withBreadcrumbs} {withDetails} />
    </div>

    <p class="text-surface-500 flex items-center justify-between text-sm">
      {#if withDetails && activity.createdAt != null}
        {formatRelative(new Date(activity.createdAt), new Date(), { locale })}
      {/if}

      {#if activity.entity.type === 'ascent' && activity.type === 'created' && (pageState.user?.id === activity.entity.object?.author?.id || checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], activity.entity.object?.regionFk))}
        <a
          aria-label="Edit ascent"
          title="Edit ascent"
          class="btn-icon preset-outlined-primary-500"
          href={`/ascents/${activity.entity.object?.id}/edit`}
        >
          <i class="fa-solid fa-pen"></i>
        </a>
      {/if}
    </p>

    {#if withFiles && activity.entity.type == 'file' && activity.entity.object != null}
      {@const file = activity.entity.object}

      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <FileViewer {file} />
      </div>
    {/if}

    {#if activity.entity.type == 'ascent' && activity.entity.object != null && activity.type === 'created'}
      {#if activity.entity.object.notes != null && activity.entity.object.notes.length > 0}
        <MarkdownRenderer markdown={activity.entity.object.notes} />
      {/if}

      {#if withFiles}
        {#if activity.entity.object.files != null && activity.entity.object.files.length > 0}
          <div
            class="mt-4 grid gap-3 {activity.entity.object.files.length === 1
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-2 md:grid-cols-4'}"
          >
            {#each activity.entity.object.files as file}
              <FileViewer
                {file}
                readOnly={!(
                  checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], file.regionFk) ||
                  activity.entity.object.createdBy === pageState.user?.id
                )}
                onDelete={() => {
                  if (activity.entity.type == 'ascent' && activity.entity.object != null) {
                    activity.entity.object.files = activity.entity.object!.files.filter((_file) => file.id !== _file.id)
                  }
                }}
              />
            {/each}
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</div>
