<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import AppBar from '$lib/components/AppBar'
  import PushNotificationSubscriber, { isSubscribed, isSupported } from '$lib/components/PushNotificationSubscriber'
  import { Switch } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'

  let { form } = $props()

  let isPushSubscribed = $state(false)
  let formEl: HTMLFormElement | undefined = $state(undefined)
  let loading = $state(false)

  let notifyModerations = $state(false)
  let notifyNewAscents = $state(false)
  let notifyNewUsers = $state(false)

  $effect(() => {
    notifyModerations = (form?.notifyModerations as boolean) ?? page.data.user?.userSettings?.notifyModerations ?? false
    notifyNewAscents = (form?.notifyNewAscents as boolean) ?? page.data.user?.userSettings?.notifyNewAscents ?? false
    notifyNewUsers = (form?.notifyNewUsers as boolean) ?? page.data.user?.userSettings?.notifyNewUsers ?? false
  })

  onMount(async () => {
    isPushSubscribed = await isSubscribed()
  })
</script>

<AppBar classes="mx-auto max-w-lg">
  {#snippet lead()}
    Hello {page.data.user?.username ?? ''}
  {/snippet}
</AppBar>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="app-settings">
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

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="user-settings">
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

<div class="card preset-filled-surface-100-900 mx-auto mt-8 mb-8 max-w-lg space-y-5 p-4" id="notifications">
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

    <form
      action="?/notifications"
      bind:this={formEl}
      method="post"
      use:enhance={async () => {
        loading = true
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return ({ result }) => {
          loading = false
          return applyAction(result)
        }
      }}
    >
      <ul>
        <li class="flex items-center justify-between gap-4 p-2">
          <p>New users</p>

          <Switch
            checked={notifyNewUsers}
            disabled={!isPushSubscribed || loading}
            onCheckedChange={(details) => {
              formEl?.requestSubmit()
              console.log('notifyNewUsers', details)
              notifyNewUsers = details.checked
            }}
            name="notifyNewUsers"
          />
        </li>

        <li class="flex items-center justify-between gap-4 p-2">
          <p>New ascents</p>

          <Switch
            checked={notifyNewAscents}
            disabled={!isPushSubscribed || loading}
            onCheckedChange={(details) => {
              formEl?.requestSubmit()
              console.log('notifyNewAscents')
              notifyNewAscents = details.checked
            }}
            name="notifyNewAscents"
          />
        </li>

        <li class="flex items-center justify-between gap-4 p-2">
          <p>New content updates</p>

          <Switch
            checked={notifyModerations}
            disabled={!isPushSubscribed || loading}
            onCheckedChange={(details) => {
              formEl?.requestSubmit()
              console.log('notifyModerations')
              notifyModerations = details.checked
            }}
            name="notifyModerations"
          />
        </li>
      </ul>
    </form>
  </section>
</div>
