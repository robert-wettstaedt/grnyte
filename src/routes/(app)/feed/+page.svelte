<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ActivityFeed from '$lib/components/ActivityFeed'
  import AppBar from '$lib/components/AppBar'
  import { isSubscribed } from '$lib/components/PushNotificationSubscriber'
  import { onMount } from 'svelte'

  const { data } = $props()

  let isPushSubscribed = $state(false)

  onMount(async () => {
    isPushSubscribed = await isSubscribed()
  })
</script>

<svelte:head>
  <title>Feed - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Feed
  {/snippet}
</AppBar>

{#if !isPushSubscribed}
  <div class="mx-auto mt-8 flex justify-center">
    <a class="btn preset-filled-primary-500" href="/settings#notifications"
      ><i class="fa-solid fa-bell"></i> Enable notifications</a
    >
  </div>
{/if}

<div class="mt-8">
  <ActivityFeed activities={data.feed.activities} pagination={data.feed.pagination} withBreadcrumbs />
</div>
