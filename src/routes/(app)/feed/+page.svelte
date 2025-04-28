<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import type { ActivityFeedProps } from '$lib/components/ActivityFeed'
  import ActivityFeed from '$lib/components/ActivityFeed'
  import AppBar from '$lib/components/AppBar'
  import { isSubscribed, isSupported } from '$lib/components/PushNotificationSubscriber'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'

  const { data } = $props()

  let isPushSubscribed = $state(false)
  let lastUpdated = $state(Date.now())
  let updater = $state<Parameters<ActivityFeedProps['onMount']>[0]>(() => {})
  let interval = $state<ReturnType<typeof setInterval> | undefined>(undefined)
  let loading = $state(false)

  function startPolling() {
    const updateInterval = 60 * 1000 // 1 min

    const update = async () => {
      try {
        loading = true
        const response = await fetch('/feed', { method: 'POST' })
        const feed = await response.json()
        updater(feed.activities)
        lastUpdated = Date.now()
      } catch (error) {
      } finally {
        loading = false
      }
    }

    interval = setInterval(update, updateInterval)

    if (lastUpdated + updateInterval < Date.now()) {
      update()
    }
  }

  function stopPolling() {
    clearInterval(interval)
  }

  onMount(() => {
    ;(async () => {
      isPushSubscribed = await isSubscribed()

      if ('clearAppBadge' in navigator) {
        try {
          await navigator.clearAppBadge()
        } catch (error) {}
      }
    })()

    startPolling()

    return () => stopPolling()
  })
</script>

<svelte:head>
  <title>Feed - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<svelte:document
  onvisibilitychange={(e) => {
    if (e.currentTarget.visibilityState === 'hidden') {
      stopPolling()
    } else {
      startPolling()
    }
  }}
/>

<AppBar>
  {#snippet lead()}
    Feed
  {/snippet}
</AppBar>

{#if !isPushSubscribed && isSupported()}
  <aside class="card preset-outlined-secondary-500 mt-4 p-4">
    <p>Don't miss out on any of the action! Enable notifications to get instant updates.</p>

    <div class="flex justify-end">
      <a class="btn preset-filled-secondary-500 mt-4" href="/settings#notifications">
        <i class="fa-solid fa-bell"></i>
        Enable notifications
      </a>
    </div>
  </aside>
{/if}

<div class="mt-8">
  {#if loading}
    <ProgressRing classes="mx-auto" size="size-4" value={null} />
  {/if}

  <ActivityFeed
    activities={data.feed.activities}
    pagination={data.feed.pagination}
    withBreadcrumbs
    onMount={(fn) => (updater = fn)}
  />
</div>
