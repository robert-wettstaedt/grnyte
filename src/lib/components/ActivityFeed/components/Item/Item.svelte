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
  import CorrectedGrade from '$lib/components/RouteGrade/components/CorrectedGrade'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import { Rating } from '@skeletonlabs/skeleton-svelte'
  import { compareAsc, format, formatDistance, formatRelative } from 'date-fns'
  import { enGB as locale } from 'date-fns/locale'
  import { diffWords } from 'diff'
  import type { ActivityDTO } from '../../'

  const { activity, withBreadcrumbs = false, withDetails = false, withFiles = false }: ItemProps = $props()

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

  const diff = $derived.by(() => {
    if (activity.oldValue != null || activity.newValue != null) {
      return diffWords(activity.oldValue ?? '', activity.newValue ?? '')
    }

    return []
  })

  const routeNameClasses = $derived.by(() => {
    if (
      activity.entity.type === 'route' &&
      activity.entity.object != null &&
      ('userGradeFk' in activity.entity.object || 'userRating' in activity.entity.object)
    ) {
      return '-inset-y-px'
    }

    return ''
  })
</script>

<div class="flex items-start gap-4">
  <div class="bg-surface-200-800 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
    <i class="fa-solid {iconClasses} text-lg"></i>
  </div>

  <div class="min-w-0 flex-1 overflow-hidden">
    <div class="mb-2">
      {#if withDetails}
        <span class="font-semibold">
          {#if activity.user == null}
            Someone
          {:else}
            <a class="anchor" href={`/users/${activity.user.username}`}>{activity.user.username}</a>
          {/if}
        </span>
      {/if}

      {#if activity.entity.type === 'ascent' && activity.type === 'created'}
        <span>
          {activity.entity.object?.type === 'flash'
            ? 'flashed'
            : activity.entity.object?.type === 'send'
              ? 'sent'
              : activity.entity.object?.type === 'repeat'
                ? 'repeated'
                : 'attempted'}

          {#if activity.parentEntity != null}
            <a
              class="anchor relative inline-flex max-w-full overflow-hidden font-medium text-ellipsis whitespace-nowrap {routeNameClasses}"
              href={`/${activity.parentEntityType}s/${activity.parentEntityId}`}
            >
              {#if activity.parentEntity.type === 'route' && activity.parentEntity.object != null}
                {@const route = activity.parentEntity.object}
                <RouteName {route} />
              {:else}
                {activity.parentEntityName}
              {/if}
            </a>
          {/if}

          {#if withBreadcrumbs && activity.parentEntity?.breadcrumb != null}
            <span class="text-surface-500">in</span>

            {#each activity.parentEntity?.breadcrumb as crumb, i}
              <span class="text-surface-500 inline-flex">{crumb}</span>

              {#if i < activity.parentEntity?.breadcrumb.length - 1}
                <span class="text-surface-500 mx-1 text-sm" aria-hidden="true">&gt;</span>
              {/if}
            {/each}
          {/if}

          {#if (activity.entity.object?.gradeFk ?? activity.entity.object?.rating) != null}
            <div class="my-2 flex items-center gap-x-1 md:gap-x-2">
              <span class="opacity-80"> Personal opinion: </span>

              {#if activity.entity.object?.gradeFk != null}
                <CorrectedGrade oldGrade={activity.entity.object?.gradeFk} newGrade={undefined} />
              {/if}

              {#if activity.entity.object?.rating != null}
                <Rating
                  count={3}
                  readOnly
                  value={activity.entity.object.rating}
                  controlClasses="!gap-0 text-xs md:text-sm"
                >
                  {#snippet iconFull()}
                    <i class="fa-solid fa-star text-warning-500"></i>
                  {/snippet}

                  {#snippet iconEmpty()}
                    <i class="fa-regular fa-star"></i>
                  {/snippet}
                </Rating>
              {/if}
            </div>
          {/if}

          {#if activity.entity.object != null && activity.createdAt != null && activity.entity.object.dateTime && compareAsc(format(new Date(activity.createdAt), 'yyyy-MM-dd'), new Date(activity.entity.object.dateTime)) !== 0}
            <span>
              {formatDistance(new Date(activity.entity.object.dateTime), new Date(), { addSuffix: true })}
            </span>
          {/if}
        </span>
      {:else if activity.entity.type === 'user' && activity.type === 'created' && activity.columnName === 'role'}
        {@const user = activity.entity.object}

        has approved
        {#if user == null}
          a user
        {:else}
          <a class="anchor" href={`/users/${user.username}`}>{user.username}</a>
        {/if}

        {#if activity.region != null}
          to region {activity.region.name}
        {/if}
      {:else if activity.entity.type === 'user' && activity.type === 'updated' && activity.columnName === 'role'}
        {@const user = activity.entity.object}

        has updated the role of
        {#if user == null}
          a user
        {:else}
          <a class="anchor" href={`/users/${user.username}`}>{user.username}</a>
        {/if}

        to {activity.newValue}

        {#if activity.region != null}
          in region {activity.region.name}
        {/if}
      {:else if activity.entity.type === 'user' && activity.type === 'deleted' && activity.columnName === 'role'}
        {@const user = activity.entity.object}

        has removed
        {#if user == null}
          a user
        {:else}
          <a class="anchor" href={`/users/${user.username}`}>{user.username}</a>
        {/if}

        {#if activity.region != null}
          from region {activity.region.name}
        {/if}
      {:else if activity.entity.type === 'user' && activity.type === 'created' && activity.columnName === 'invitation'}
        has invited
        <a class="anchor" href={`mailto:${activity.newValue}`}>{activity.newValue}</a>

        {#if activity.region != null}
          to region {activity.region.name}
        {/if}
      {:else if activity.entity.type === 'user' && activity.type === 'updated' && activity.columnName === 'invitation'}
        has accepted the invitation to join

        {#if activity.region != null}
          region {activity.region.name}
        {/if}
      {:else if activity.entity.type === 'user' && activity.type === 'deleted' && activity.columnName === 'invitation'}
        has removed the invitation to
        <a class="anchor" href={`mailto:${activity.newValue}`}>{activity.newValue}</a>

        {#if activity.region != null}
          from region {activity.region.name}
        {/if}
      {:else}
        <span>
          {activity.type}

          {#if activity.entityType == 'file'}
            a
            {activity.columnName ?? activity.entityType}
          {:else}
            {#if activity.columnName == null}
              a
            {:else}
              <span class="text-surface-500">the</span>
              {activity.columnName.replace(/Fk$/, '')}
              <span class="text-surface-500">of</span>
            {/if}

            {#if activity.entity.type === 'ascent' && activity.entity.object != null}
              {#if activity.entity.object.createdBy === pageState.user?.id}
                their own
              {:else if activity.entity.object.author != null}
                <a class="anchor" href={`/users/${activity.entity.object.author.authUserFk}`}>
                  {activity.entity.object.author.username}'s
                </a>
              {/if}
            {/if}

            {activity.entityType}
          {/if}

          {#if activity.entity.type != 'file'}
            <a
              class="anchor relative inline-flex max-w-full overflow-hidden font-medium text-ellipsis whitespace-nowrap {routeNameClasses}"
              href={`/${activity.entityType}s/${activity.entityId}`}
            >
              {#if activity.entity.type === 'route' && activity.entity.object != null}
                {@const route = activity.entity.object}
                <RouteName {route} />
              {:else}
                {activity.entityName}
              {/if}
            </a>
          {/if}

          {#if activity.parentEntityType != null && activity.parentEntityId != null && activity.parentEntityName != null && withDetails}
            <span class="text-surface-500">in</span>
            <a class="anchor inline-flex flex-wrap" href={`/${activity.parentEntityType}s/${activity.parentEntityId}`}>
              {#if withBreadcrumbs && activity.parentEntity?.breadcrumb != null}
                {#each activity.parentEntity?.breadcrumb as crumb, i}
                  <span class="text-surface-500 inline-flex">{crumb}</span>

                  <span class="text-surface-500 mx-1 text-sm" aria-hidden="true">&gt;</span>
                {/each}
              {/if}

              {#if activity.parentEntity?.type === 'route' && activity.parentEntity.object != null}
                {#if withBreadcrumbs && activity.parentEntity?.breadcrumb != null}
                  &nbsp;
                {/if}

                {@const route = activity.parentEntity.object}
                <RouteName {route} />
              {:else}
                {activity.parentEntityName}
              {/if}
            </a>
          {/if}
        </span>

        {#if activity.oldValue != null || activity.newValue != null}
          {#if activity.columnName === 'gradeFk'}
            <div class="inline-flex">
              <CorrectedGrade
                oldGrade={activity.oldValue == null ? null : Number(activity.oldValue)}
                newGrade={activity.newValue == null ? null : Number(activity.newValue)}
              />
            </div>
          {:else if ['notes', 'name', 'tags', 'description', 'first ascent'].includes(activity.columnName ?? '')}
            <span>
              {#each diff as change}
                <span class={change.added ? 'text-green-500' : change.removed ? 'text-red-500' : ''}>
                  {change.value}
                </span>
              {/each}
            </span>
          {:else}
            {#if activity.oldValue != null}
              {#if activity.columnName === 'rating'}
                <span class="inline-flex">
                  <Rating count={3} readOnly value={Number(activity.oldValue)}>
                    {#snippet iconFull()}
                      <i class="fa-solid fa-star text-warning-500"></i>
                    {/snippet}
                  </Rating>
                </span>
              {:else}
                <s class="text-red-500">
                  "{activity.oldValue}"
                </s>
              {/if}
            {/if}

            {#if activity.newValue != null}
              <i class="fa-solid fa-arrow-right-long mx-2"></i>

              {#if activity.columnName === 'rating'}
                <span class="inline-flex">
                  <Rating count={3} readOnly value={Number(activity.newValue)}>
                    {#snippet iconFull()}
                      <i class="fa-solid fa-star text-warning-500"></i>
                    {/snippet}
                  </Rating>
                </span>
              {:else}
                <s class="text-red-500">
                  "{activity.newValue}"
                </s>
              {/if}
            {/if}
          {/if}
        {/if}
      {/if}
    </div>

    <p class="text-surface-500 flex items-center justify-between text-sm">
      {#if withDetails && activity.createdAt != null}
        {formatRelative(new Date(activity.createdAt), new Date(), { locale })}
      {/if}

      {#if activity.entity.type === 'ascent' && activity.type === 'created' && (pageState.user?.id === activity.entity.object?.author?.id || checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], activity.entity.object?.regionFk))}
        <a
          aria-label="Edit ascent"
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

    {#if withFiles && activity.entity.type == 'ascent' && activity.entity.object != null && activity.type === 'created'}
      {#if activity.entity.object.notes != null && activity.entity.object.notes.length > 0}
        <MarkdownRenderer markdown={activity.entity.object.notes} />
      {/if}

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
  </div>
</div>
