<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ActivityFeed from '$lib/components/ActivityFeed'
  import AppBar from '$lib/components/AppBar'
  import { isSubscribed, isSupported } from '$lib/components/PushNotificationSubscriber'
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
  <ActivityFeed activities={data.feed.activities} pagination={data.feed.pagination} withBreadcrumbs />
</div>
