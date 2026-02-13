<script lang="ts">
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
  import { getI18n, languages } from '$lib/i18n'
  import { dropAllDatabases } from '@rocicorp/zero'
  import { AppBar, Switch } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'
  import { updateGradeSettings, updateNotificationSettings } from './page.remote'

  let isPushSubscribed = $state(false)
  let modalOpen = $state(false)
  let notifyModerations = $state(false)
  let notifyNewAscents = $state(false)
  let notifyNewUsers = $state(false)

  $effect(() => {
    notifyModerations = pageState.user?.userSettings?.notifyModerations ?? false
    notifyNewAscents = pageState.user?.userSettings?.notifyNewAscents ?? false
    notifyNewUsers = pageState.user?.userSettings?.notifyNewUsers ?? false
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

  const { changeLanguage, t, language } = getI18n()
</script>

<AppBar class="mx-auto max-w-lg">
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      {t('settings.hello', { username: pageState.user?.username ?? '' })}
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="app-settings">
  <header class="space-y-1">
    <h2 class="h4">{t('settings.appSettings.title')}</h2>
  </header>

  <section class="w-full space-y-5">
    <ul>
      <li>
        <div class="flex items-center justify-between gap-4 p-2">
          <div>{t('settings.appSettings.language')}</div>

          <select class="select w-32" value={language} onchange={(event) => changeLanguage(event.currentTarget.value)}>
            {#each languages as language}
              <option value={language}>{t(`settings.languages.${language}`)}</option>
            {/each}
          </select>
        </div>
      </li>

      <li>
        <div class="flex items-center justify-between gap-4 p-2">
          <div>{t('settings.appSettings.gradingScale')}</div>

          <select
            class="select w-24"
            value={pageState.user?.userSettings?.gradingScale}
            onchange={(event) => updateGradeSettings(event.currentTarget.value as 'FB' | 'V')}
          >
            <option value="FB">FB</option>
            <option value="V">V</option>
          </select>
        </div>
      </li>

      {#if checkAppPermission(pageState.userPermissions, [APP_PERMISSION_ADMIN])}
        <li class="border-surface-800 border-t">
          <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/settings/tags">
            {t('settings.appSettings.manageTags')}

            <i class="fa-solid fa-chevron-right"></i>
          </a>
        </li>

        <li class="border-surface-800 border-t">
          <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/settings/users">
            {t('settings.appSettings.manageUsers')}

            <i class="fa-solid fa-chevron-right"></i>
          </a>
        </li>
      {/if}
    </ul>
  </section>
</div>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="region-settings">
  <header class="space-y-1">
    <h2 class="h4">{t('settings.regionSettings.title')}</h2>
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
          {t('settings.regionSettings.createRegion')}

          <i class="fa-solid fa-plus"></i>
        </a>
      </li>
    </ul>
  </section>
</div>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="user-settings">
  <header class="space-y-1">
    <h2 class="h4">{t('settings.userSettings.title')}</h2>
  </header>

  <section class="w-full space-y-5">
    <ul>
      <li>
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/profile/edit">
          {t('settings.userSettings.editProfile')}

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>

      <li class="border-surface-800 border-t">
        <a
          class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2"
          href="/profile/change-password"
        >
          {t('settings.userSettings.changePassword')}

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>

      <li class="border-surface-800 border-t">
        <button
          class="hover:preset-tonal-primary flex w-full items-center justify-between gap-4 p-2"
          onclick={onSignout}
        >
          {t('auth.signOut')}

          <i class="fa-solid fa-sign-out"></i>
        </button>
      </li>
    </ul>
  </section>
</div>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 mb-8 max-w-lg space-y-5 p-4" id="notifications">
  <header class="space-y-1">
    <h2 class="h4">{t('settings.notifications.title')}</h2>

    {#if isSupported()}
      <p class="opacity-60">{t('settings.notifications.selectNotifications')}</p>
    {:else if isIOS}
      <aside class="card preset-tonal-warning my-4 p-4 whitespace-pre-line">
        <p>
          {t('settings.notifications.addToHomeScreen')}

          <button class="anchor inline" onclick={() => (modalOpen = true)}>
            {t('settings.notifications.showMeHow')} <i class="fa-solid fa-chevron-right"></i>
          </button>
        </p>
      </aside>
    {:else}
      <aside class="card preset-tonal-error my-4 p-4 whitespace-pre-line">
        <p>{t('settings.notifications.notSupported')}</p>
      </aside>
    {/if}

    <AddToHomescreen {modalOpen} />
  </header>

  <section class="w-full space-y-5">
    <PushNotificationSubscriber onChange={async () => (isPushSubscribed = await isSubscribed())} />

    <ul>
      <Switch
        class="flex items-center justify-between gap-4 p-2"
        checked={notifyNewUsers}
        disabled={!isPushSubscribed || updateNotificationSettings.pending > 0}
        onCheckedChange={(details) => {
          notifyNewUsers = details.checked
          updateNotificationSettings({ notifyModerations, notifyNewAscents, notifyNewUsers })
        }}
      >
        <Switch.Label>{t('settings.notifications.newUsers')}</Switch.Label>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.HiddenInput />
      </Switch>

      <hr class="hr" />

      <Switch
        class="flex items-center justify-between gap-4 p-2"
        checked={notifyNewAscents}
        disabled={!isPushSubscribed || updateNotificationSettings.pending > 0}
        onCheckedChange={(details) => {
          notifyNewAscents = details.checked
          updateNotificationSettings({ notifyModerations, notifyNewAscents, notifyNewUsers })
        }}
      >
        <Switch.Label>{t('settings.notifications.newAscents')}</Switch.Label>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.HiddenInput />
      </Switch>

      <hr class="hr" />

      <Switch
        class="flex items-center justify-between gap-4 p-2"
        checked={notifyModerations}
        disabled={!isPushSubscribed || updateNotificationSettings.pending > 0}
        onCheckedChange={(details) => {
          notifyModerations = details.checked
          updateNotificationSettings({ notifyModerations, notifyNewAscents, notifyNewUsers })
        }}
      >
        <Switch.Label>{t('settings.notifications.newContentUpdates')}</Switch.Label>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.HiddenInput />
      </Switch>
    </ul>
  </section>
</div>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4" id="legal">
  <header class="space-y-1">
    <h2 class="h4">{t('common.legal')}</h2>
  </header>

  <section class="w-full space-y-5">
    <ul>
      <li>
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/legal/privacy">
          {t('legal.privacyPolicy')}

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>

      <li class="border-surface-800 border-t">
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/legal/terms">
          {t('legal.termsOfService')}

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>

      <li class="border-surface-800 border-t">
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/legal/cookies">
          {t('legal.cookiePolicy')}

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>

      <li class="border-surface-800 border-t">
        <a class="hover:preset-tonal-primary flex items-center justify-between gap-4 p-2" href="/legal/disclaimer">
          {t('legal.disclaimer')}

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
          {t('settings.serviceStatus')}

          <i class="fa-solid fa-chevron-right"></i>
        </a>
      </li>
    </ul>
  </section>
</div>
