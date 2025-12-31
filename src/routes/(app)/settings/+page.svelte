<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { invalidateAll } from '$app/navigation'
  import { page } from '$app/state'
  import { APP_PERMISSION_ADMIN, checkAppPermission } from '$lib/auth'
  import AddToHomescreen from '$lib/components/AddToHomescreen'
  import { pageState } from '$lib/components/Layout'
  import PushNotificationSubscriber, {
    isSubscribed,
    isSupported,
    unsubscribe,
  } from '$lib/components/PushNotificationSubscriber'
  import { timeoutFunction } from '$lib/errors'
  import { isIOS } from '$lib/features'
  import { dropAllDatabases } from '@rocicorp/zero'
  import { AppBar, Switch } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'

  let { form } = $props()

  let isPushSubscribed = $state(false)
  let formEl: HTMLFormElement | undefined = $state(undefined)
  let loading = $state(false)
  let modalOpen = $state(false)
  let notifyModerations = $state(false)
  let notifyNewAscents = $state(false)
  let notifyNewUsers = $state(false)

  $effect(() => {
    notifyModerations = (form?.notifyModerations as boolean) ?? pageState.user?.userSettings?.notifyModerations ?? false
    notifyNewAscents = (form?.notifyNewAscents as boolean) ?? pageState.user?.userSettings?.notifyNewAscents ?? false
    notifyNewUsers = (form?.notifyNewUsers as boolean) ?? pageState.user?.userSettings?.notifyNewUsers ?? false
  })

  onMount(async () => {
    isPushSubscribed = await isSubscribed()
  })

  const onSignout = async () => {
    try {
      await timeoutFunction(unsubscribe, 3_000)
    } catch (error) {
      console.error(error)
    }

    await Promise.all([page.data.supabase?.auth.signOut(), dropAllDatabases()])
  }
</script>

<AppBar class="mx-auto max-w-lg">
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      Hello {pageState.user?.username ?? ''}
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="app-settings">
  <header class="space-y-1">
    <h2 class="h4">App settings</h2>
  </header>

  <section class="w-full space-y-5">
    <ul>
      <li>
        <div class="flex items-center justify-between gap-4 p-2">
          <div>Grading scale</div>

          <select
            class="select w-24"
            value={pageState.user?.userSettings?.gradingScale}
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
      </li>

      {#if checkAppPermission(pageState.userPermissions, [APP_PERMISSION_ADMIN])}
        <li class="border-surface-800 border-t">
          <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/settings/tags">
            Manage tags

            <i class="fa-solid fa-chevron-right"></i>
          </a>
        </li>

        <li class="border-surface-800 border-t">
          <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/settings/users">
            Manage users

            <i class="fa-solid fa-chevron-right"></i>
          </a>
        </li>
      {/if}
    </ul>
  </section>
</div>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="region-settings">
  <header class="space-y-1">
    <h2 class="h4">Region settings</h2>
  </header>

  <section class="w-full space-y-5">
    <ul>
      {#each pageState.userRegions as region, index}
        <li class={index === 0 ? '' : 'border-surface-800 border-t'}>
          <a
            class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2"
            href="/settings/regions/{region.regionFk}"
          >
            {region.name}

            <i class="fa-solid fa-chevron-right"></i>
          </a>
        </li>
      {/each}

      <li class={pageState.userRegions.length === 0 ? '' : 'border-surface-800 border-t'}>
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/settings/regions/add">
          Create region

          <i class="fa-solid fa-plus"></i>
        </a>
      </li>
    </ul>
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
          onclick={onSignout}
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
    {:else if isIOS}
      <aside class="card preset-tonal-warning my-4 p-4 whitespace-pre-line">
        <p>
          To request permission to receive push notifications, web apps must first be added to the Home Screen.

          <button class="anchor inline" onclick={() => (modalOpen = true)}>
            Show me how <i class="fa-solid fa-chevron-right"></i>
          </button>
        </p>
      </aside>
    {:else}
      <aside class="card preset-tonal-error my-4 p-4 whitespace-pre-line">
        <p>Push notifications are not supported by your browser.</p>
      </aside>
    {/if}

    <AddToHomescreen {modalOpen} />
  </header>

  <section class="w-full space-y-5">
    <PushNotificationSubscriber onChange={async () => (isPushSubscribed = await isSubscribed())} />

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

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="legal">
  <header class="space-y-1">
    <h2 class="h4">Legal</h2>
  </header>

  <section class="w-full space-y-5">
    <ul>
      <li>
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/legal/privacy">
          Privacy policy

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>

      <li class="border-surface-800 border-t">
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/legal/terms">
          Terms of service

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>

      <li class="border-surface-800 border-t">
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/legal/cookies">
          Cookie policy

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>

      <li class="border-surface-800 border-t">
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/legal/disclaimer">
          Disclaimer

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>
    </ul>
  </section>
</div>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="rest">
  <section class="w-full space-y-5">
    <ul>
      <li>
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/status">
          Service Status

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>
    </ul>
  </section>
</div>
