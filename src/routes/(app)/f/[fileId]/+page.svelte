<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { PUBLIC_APPLICATION_NAME, PUBLIC_BUNNY_STREAM_HOSTNAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { DELETE_PERMISSION, READ_PERMISSION } from '$lib/auth'
  import { getVideoThumbnailUrl } from '$lib/bunny'
  import { Full } from '$lib/components/FileViewer'
  import RouteName from '$lib/components/RouteName'
  import { formatDistance } from 'date-fns'

  const { data } = $props()

  const entityType = $derived(
    data.file.areaFk != null
      ? 'area'
      : data.file.blockFk != null
        ? 'block'
        : data.file.routeFk != null
          ? 'route'
          : 'ascent',
  )

  const entityId = $derived(data.file.areaFk ?? data.file.blockFk ?? data.file.routeFk ?? data.file.ascentFk)
  const pathname = $derived(`/${entityType}s/${entityId}`)

  let isNotesExpanded = $state(false)
</script>

<svelte:head>
  <meta name="description" content="Secure boulder topo and session tracker." />
  <meta property="og:title" content={PUBLIC_APPLICATION_NAME} />
  <meta property="og:description" content="Secure boulder topo and session tracker." />
  {#if data.file.bunnyStreamFk != null}
    <meta
      property="og:image"
      content={getVideoThumbnailUrl({
        format: 'jpg',
        hostname: PUBLIC_BUNNY_STREAM_HOSTNAME,
        videoId: data.file.bunnyStreamFk,
      })}
    />
  {/if}
  <meta property="og:url" content={$page.url.toString()} />
  <meta property="og:type" content="website" />

  {#if data.file.ascent == null}
    <title>Shared file - {PUBLIC_APPLICATION_NAME}</title>
  {:else}
    <title>
      {data.file.ascent.author.username}'s ascent of {data.file.ascent.route.name} - {PUBLIC_APPLICATION_NAME}
    </title>
  {/if}
</svelte:head>

{#if data.file.stat != null}
  <div class="bg-black w-full relative" use:fitHeightAction={{ paddingBottom: 0 }}>
    <Full
      file={data.file}
      onDelete={() => goto(pathname)}
      readOnly={!data.userPermissions?.includes(DELETE_PERMISSION) || data.file.ascent?.author.id !== data.user?.id}
      stat={data.file.stat}
    >
      {#snippet topLeft()}
        {#if data.authUser != null && data.userPermissions?.includes(READ_PERMISSION)}
          <a class="btn btn-sm bg-black/20 backdrop-blur-sm" href={pathname}>
            Show {entityType}

            <i class="fa-solid fa-arrow-right"></i>
          </a>
        {:else}
          <div></div>
        {/if}
      {/snippet}
    </Full>

    {#if isNotesExpanded}
      <div
        class="absolute top-0 left-0 w-full h-full {isNotesExpanded
          ? 'bg-black/40'
          : 'bg-black/0'} transition-all duration-300 touch-none pointer-events-none user-select-none"
      ></div>
    {/if}

    {#if data.file.ascent != null}
      <div
        class="absolute bottom-16 left-0 right-0 p-2"
        onclick={() => (isNotesExpanded = !isNotesExpanded)}
        role="presentation"
      >
        <span class="text-xs opacity-80">
          {formatDistance(new Date(data.file.ascent.dateTime), new Date(), { addSuffix: true })}
        </span>

        <div class="flex items-center flex-wrap gap-2">
          <span>{data.file.ascent.author.username}</span>

          {data.file.ascent.type === 'flash'
            ? 'flashed'
            : data.file.ascent.type === 'send'
              ? 'sent'
              : data.file.ascent.type === 'repeat'
                ? 'repeated'
                : 'attempted'}

          <RouteName route={data.file.ascent.route} />
        </div>

        {#if data.notes != null}
          <div
            class="rendered-markdown {isNotesExpanded
              ? 'max-h-[300px] overflow-auto'
              : 'max-h-[32px] overflow-hidden'} transition-all duration-300 -mt-[8px]"
          >
            {@html data.notes}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
