<script lang="ts">
  import { invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import AppBar from '$lib/components/AppBar'
  import { Switch } from '@skeletonlabs/skeleton-svelte'
  import PushNotificationSubscriber, { isSubscribed, isSupported } from '$lib/components/PushNotificationSubscriber'
  import { onMount } from 'svelte'

  const { form } = $props()

  let isPushSubscribed = $state(false)

  onMount(async () => {
    isPushSubscribed = await isSubscribed()
  })
</script>

<AppBar>
  {#snippet lead()}
    Hello {page.data.user?.username ?? ''}
  {/snippet}
</AppBar>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4">
  <header class="space-y-1">
    <h2 class="h4">App settings</h2>
  </header>

  <section class="w-full space-y-5">
    <div class="flex items-center justify-between gap-4 p-2">
      <div>Grading scale</div>

      <select
        class="select w-24"
        value={page.data.user?.userSettings?.gradingScale}
        onchange={async (event) => {
          const response = await fetch(`/api/users/settings?gradingScale=${event.currentTarget.value}`, {
            method: 'POST',
          })

          if (response.ok) {
            invalidateAll()
          }
        }}
      >
        <option value="FB">FB</option>
        <option value="V">V</option>
      </select>
    </div>
  </section>
</div>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4">
  <header class="space-y-1">
    <h2 class="h4">User settings</h2>
  </header>

  <section class="w-full space-y-5">
    <ul>
      <li>
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/profile/edit">
          Edit profile

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>

      <li class="border-surface-800 border-t">
        <a
          class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2"
          href="/profile/change-password"
        >
          Change password

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>

      <li class="border-surface-800 border-t">
        <button
          class="hover:preset-tonal-primary flex w-full items-center justify-between gap-4 p-2"
          onclick={() => page.data.supabase?.auth.signOut()}
        >
          Sign out

          <i class="fa-solid fa-sign-out"></i>
        </button>
      </li>
    </ul>
  </section>
</div>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 mb-8 max-w-lg space-y-5 p-4">
  <header class="space-y-1">
    <h2 class="h4">Notification settings</h2>
    {#if isSupported()}
      <p class="opacity-60">Select which notifications you want to receive.</p>
    {:else}
      <p class="text-error-500 opacity-60">Push notifications are not supported by your browser.</p>
    {/if}
  </header>

  <section class="w-full space-y-5">
    <PushNotificationSubscriber />

    <ul>
      <li class="flex items-center justify-between gap-4 p-2">
        <p>New users</p>

        <Switch disabled={!isPushSubscribed} name="ascents" />
      </li>

      <li class="flex items-center justify-between gap-4 p-2">
        <p>New ascents</p>

        <Switch disabled={!isPushSubscribed} name="ascents" />
      </li>
    </ul>
  </section>
</div>
