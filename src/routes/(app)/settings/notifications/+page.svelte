<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PushSetup from '$lib/components/PushSetup/PushSetup.svelte'
  import SettingSection from '$lib/components/Setting/SettingSection.svelte'
  import { sendTestPush } from '$lib/entities/notification/notifications.remote'
  import { updateUserSettings } from '$lib/entities/user/users.remote'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { disablePush, enablePush, pushEndpoint, pushState } from '$lib/state/push.svelte'
  import { notifyError, toaster } from '$lib/state/toast'
  import SettingSwitch from '../SettingSwitch.svelte'

  const global = getGlobalState()

  // The switches read straight off the synced settings rather than through local state: the
  // switch owns its own optimism and reverts itself, so a second copy here could only disagree.
  const settings = $derived(global.user?.userSettings)

  const push = $derived(pushState())
  const endpoint = $derived(pushEndpoint())

  let switchingPush = $state(false)
  let testing = $state(false)

  // Per device by construction: a subscription belongs to one browser. Turning it off leaves the
  // permission granted, so turning it back on needs no second native prompt.
  const onPushDevice = async (checked: boolean) => {
    switchingPush = true
    try {
      if (checked) {
        await enablePush()
      } else {
        await disablePush()
      }
    } finally {
      switchingPush = false
    }
  }

  // The only practical way to debug an installed iOS PWA, where a broken subscription and a
  // working one with nothing to send look exactly alike from the outside.
  const onTestPush = async () => {
    if (endpoint == null) return

    testing = true
    try {
      const result = await sendTestPush({ endpoint })
      // The push service accepting it is all the server can know; whether the device then showed
      // anything is exactly what the reader is looking at their screen to find out.
      toaster.create(
        result?.data?.delivered === true
          ? { title: m.settings_pushTestSent(), type: 'success' }
          : { title: m.settings_pushTestFailed(), type: 'error' },
      )
    } catch (cause) {
      notifyError(cause)
    } finally {
      testing = false
    }
  }
</script>

<svelte:head>
  <title>{m.settings_notifications()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/settings'))} title={m.settings_notifications()} />

<div class="container mx-auto max-w-2xl space-y-8 px-4 py-8 pb-24 md:pb-8">
  <!-- Notifications, split by scope rather than by hierarchy: delivery is per browser, the types
       below are per account. -->
  <SettingSection title={m.settings_notificationsDelivery()}>
    <div class="space-y-3">
      <PushSetup />

      {#if push === 'granted'}
        <div class="border-surface-200-800 rounded-xl border">
          <SettingSwitch
            checked={endpoint != null}
            disabled={switchingPush}
            label={m.settings_push()}
            onchange={onPushDevice}
          />
        </div>

        {#if endpoint != null}
          <button type="button" class="btn preset-tonal-surface w-full" disabled={testing} onclick={onTestPush}>
            {m.settings_pushTest()}
          </button>
        {/if}
      {/if}
    </div>
  </SettingSection>

  <!-- Deliberately outside the permission gate above: these are account settings, and the device
       reading them is not necessarily one that receives anything. A laptop where the native prompt
       was never answered still has to be able to change what the phone gets.

       They govern PUSH only: a mention still lands in the inbox and a guidebook edit still lands in the
       feed whatever they say, which is why there is no switch that turns either of those off. -->
  <SettingSection title={m.settings_notificationsTypes()}>
    {#snippet aside()}
      <span class="text-surface-600-400 text-xs">{m.settings_notifyScope()}</span>
    {/snippet}

    <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
      <SettingSwitch
        checked={settings?.notifyDirected ?? true}
        hint={m.settings_notifyDirectedHint()}
        label={m.settings_notifyDirected()}
        onchange={(checked) => updateUserSettings({ notifyDirected: checked })}
      />

      <SettingSwitch
        checked={settings?.notifyReactions ?? true}
        hint={m.settings_notifyReactionsHint()}
        label={m.settings_notifyReactions()}
        onchange={(checked) => updateUserSettings({ notifyReactions: checked })}
      />

      <SettingSwitch
        checked={settings?.notifyComments ?? true}
        hint={m.settings_notifyCommentsHint()}
        label={m.settings_notifyComments()}
        onchange={(checked) => updateUserSettings({ notifyComments: checked })}
      />

      <SettingSwitch
        checked={settings?.notifyAscents ?? true}
        hint={m.settings_notifyAscentsHint()}
        label={m.settings_notifyAscents()}
        onchange={(checked) => updateUserSettings({ notifyAscents: checked })}
      />

      <SettingSwitch
        checked={settings?.notifyGuidebookEdits ?? true}
        hint={m.settings_notifyGuidebookEditsHint()}
        label={m.settings_notifyGuidebookEdits()}
        onchange={(checked) => updateUserSettings({ notifyGuidebookEdits: checked })}
      />

      <SettingSwitch
        checked={settings?.notifyCommunity ?? true}
        hint={m.settings_notifyCommunityHint()}
        label={m.settings_notifyCommunity()}
        onchange={(checked) => updateUserSettings({ notifyCommunity: checked })}
      />
    </div>
  </SettingSection>
</div>
