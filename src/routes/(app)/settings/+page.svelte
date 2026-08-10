<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { APP_PERMISSION_ADMIN } from '$lib/auth'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import InstallApp from '$lib/components/InstallApp/InstallApp.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PushSetup from '$lib/components/PushSetup/PushSetup.svelte'
  import { sendTestPush } from '$lib/entities/notification/notifications.remote'
  import type { UserInvitationItem } from '$lib/entities/region/dto'
  import { acceptMyInvitation, listMyInvitations } from '$lib/entities/region/regions.remote'
  import { roleLabel } from '$lib/entities/rolePermission/mapper'
  import type { GradingScale, UnitSystem } from '$lib/entities/user/dto'
  import { updateUserSettings } from '$lib/entities/user/users.remote'
  import { m } from '$lib/paraglide/messages'
  import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { disablePush, enablePush, pushEndpoint, pushState } from '$lib/state/push.svelte'
  import { notifyError, toaster } from '$lib/state/toast'
  import { legalLinks } from '../../(landing)/legal/links'
  import SettingLink from './SettingLink.svelte'
  import SettingSection from './SettingSection.svelte'
  import SettingSelect from './SettingSelect.svelte'
  import SettingSwitch from './SettingSwitch.svelte'
  import ThemeSwitch from './ThemeSwitch.svelte'

  const global = getGlobalState()

  // The account's email lives in Supabase auth, not in our `users` row.
  const email = $derived(page.data.session?.user.email)

  // Local edit state seeded from the loaded settings (the app shell gates rendering until they
  // load, so `user` is present here). 'auto' is the UI value for "follow locale".
  let gradingScale = $state<GradingScale>(global.user?.userSettings?.gradingScale ?? 'FB')
  let unitSystem = $state<'auto' | UnitSystem>(global.user?.userSettings?.unitSystem ?? 'auto')

  const legalPages = legalLinks()

  // Invitations addressed to this account, so the emailed link is never the only way in. An
  // invitee who already belongs to some other region never trips the authGuard bounce (it only
  // fires on zero regions), and until this list existed their only route was the mail.
  // Created once, outside the $derived: a remote query built inside one belongs to that derived's
  // effect, and reading `current` back out of it once the response lands warns `derived_inert` and
  // renders nothing. This query takes no arguments, so there is nothing for it to react to anyway.
  const myInvitations = listMyInvitations()
  const invitations = $derived(myInvitations.current ?? [])

  let joining = $state<number | undefined>(undefined)

  const onJoin = async (invitation: UserInvitationItem) => {
    joining = invitation.id

    try {
      await acceptMyInvitation({ invitationFk: invitation.id })
      // A full page navigation, not `goto`: the Zero client is session scoped and preloads
      // userRegions at init, so a client-side navigation would sync nothing of the new region.
      location.href = resolve('/explore')
    } catch (cause) {
      joining = undefined
      notifyError(cause)
    }
  }

  // Optimistic write of a single field: the command is RLS-gated with no Zero optimism, so on
  // failure we revert the select and toast. Writing one field at a time means a change never
  // clobbers the other with a stale value.
  const onGradingScale = async (value: GradingScale) => {
    const previous = gradingScale
    gradingScale = value
    try {
      await updateUserSettings({ gradingScale: value })
    } catch {
      gradingScale = previous
      notifyError()
    }
  }

  // Two settings with different scopes. The UI language stays per device (the paraglide cookie),
  // because that is the one people expect to follow the machine they are on. `contactLocale` is
  // per account, because an email has to pick exactly one language and the account is the only
  // thing the sender can see. This picker is an explicit choice, so it writes both.
  const onLanguage = async (value: Locale) => {
    // Persisted BEFORE setLocale, which reloads the page and would abort the request in flight.
    try {
      await updateUserSettings({ contactLocale: value })
    } catch {
      // The UI language is device local and must switch anyway; only the mail preference is lost.
    }
    setLocale(value)
  }

  const onUnitSystem = async (value: 'auto' | UnitSystem) => {
    const previous = unitSystem
    unitSystem = value
    try {
      await updateUserSettings({ unitSystem: value === 'auto' ? null : value })
    } catch {
      unitSystem = previous
      notifyError()
    }
  }

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
    } catch (cause) {
      notifyError(cause)
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

  const signOut = async () => {
    // supabase is always present under (app); the guard just narrows the route-union type.
    const { supabase } = page.data
    if (supabase == null) return

    // Release this device FIRST. A push endpoint belongs to the browser, not the account, so a
    // subscription left behind keeps delivering the signed-out person's digests, and the next
    // account to sign in here collides with a row it cannot see. Best effort: a failure here must
    // not be what stops somebody signing out.
    await disablePush().catch(() => undefined)

    // signOut resolves with { error } rather than throwing; on failure the session survives, so
    // surface it instead of navigating to the landing page as if it worked.
    const { error } = await supabase.auth.signOut()
    if (error != null) {
      notifyError()
      return
    }

    await goto(resolve('/'))
  }
</script>

<svelte:head>
  <title>{m.settings_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/profile'))} title={m.settings_title()} />

<div class="container mx-auto max-w-2xl space-y-8 px-4 py-8 pb-24 md:pb-8">
  <!-- Account -->
  <SettingSection title={m.settings_account()}>
    <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
      <SettingLink href={resolve('/settings/username')} label={m.auth_username()} value={global.user?.username} />
      <SettingLink href={resolve('/settings/email')} label={m.auth_email()} value={email} />
      <SettingLink href={resolve('/settings/password')} label={m.auth_password()} value="••••••••" />
    </div>
  </SettingSection>

  <!-- Preferences -->
  <SettingSection title={m.settings_app()}>
    <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
      <label for="setting-language" class="flex items-center justify-between gap-4 p-4">
        <span>
          {m.settings_language()}
          <span class="text-surface-600-400 block text-xs">{m.settings_languageHint()}</span>
        </span>
        <!-- Endonyms: each language is labelled in its own name (picker convention). setLocale
             sets the cookie and reloads to apply. -->
        <SettingSelect
          id="setting-language"
          value={getLocale()}
          onchange={onLanguage}
          options={[
            { label: 'English', value: 'en' satisfies Locale },
            { label: 'Deutsch', value: 'de' satisfies Locale },
          ]}
        />
      </label>

      <label for="setting-theme" class="flex items-center justify-between gap-4 p-4">
        <span>{m.theme_label()}</span>
        <ThemeSwitch id="setting-theme" />
      </label>

      <label for="setting-gradeScale" class="flex items-center justify-between gap-4 p-4">
        <span>{m.settings_gradeScale()}</span>
        <SettingSelect
          id="setting-gradeScale"
          value={gradingScale}
          onchange={onGradingScale}
          options={[
            { label: m.settings_gradeScaleFB(), value: 'FB' },
            { label: m.settings_gradeScaleV(), value: 'V' },
          ]}
        />
      </label>

      <label for="setting-units" class="flex items-center justify-between gap-4 p-4">
        <span>{m.settings_units()}</span>
        <SettingSelect
          id="setting-units"
          value={unitSystem}
          onchange={onUnitSystem}
          options={[
            { label: m.settings_unitsAuto(), value: 'auto' },
            { label: m.settings_unitsMetric(), value: 'metric' },
            { label: m.settings_unitsImperial(), value: 'imperial' },
          ]}
        />
      </label>
    </div>
  </SettingSection>

  <!-- Notifications. The four switches govern PUSH only: a mention still lands in the inbox and a
       crag edit still lands in the feed whatever they say, which is why there is no switch that
       turns either of those off. -->
  <SettingSection title={m.settings_notifications()}>
    <div class="space-y-3">
      <PushSetup />

      {#if push === 'granted'}
        <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
          <SettingSwitch
            checked={endpoint != null}
            disabled={switchingPush}
            hint={m.settings_pushHint()}
            label={m.settings_push()}
            onchange={onPushDevice}
          />

          <!-- Account-wide, so deliberately NOT gated on this device having a subscription:
               turning push off on a phone must not lock somebody out of preferences that still
               govern their laptop. -->
          <SettingSwitch
            checked={settings?.notifyDirected ?? true}
            hint={m.settings_notifyDirectedHint()}
            label={m.settings_notifyDirected()}
            onchange={(checked) => updateUserSettings({ notifyDirected: checked })}
          />

          <SettingSwitch
            checked={settings?.notifyAscents ?? true}
            hint={m.settings_notifyAscentsHint()}
            label={m.settings_notifyAscents()}
            onchange={(checked) => updateUserSettings({ notifyAscents: checked })}
          />

          <SettingSwitch
            checked={settings?.notifyCragEdits ?? true}
            hint={m.settings_notifyCragEditsHint()}
            label={m.settings_notifyCragEdits()}
            onchange={(checked) => updateUserSettings({ notifyCragEdits: checked })}
          />

          <SettingSwitch
            checked={settings?.notifyCommunity ?? true}
            hint={m.settings_notifyCommunityHint()}
            label={m.settings_notifyCommunity()}
            onchange={(checked) => updateUserSettings({ notifyCommunity: checked })}
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

  <!-- The permanent, always-available install path, and the only one that never retires itself.
       A card rather than a settings row, because the branch that cannot use a prompt has to
       explain itself in more than a row's worth of space. Absent on desktop, where installing
       buys nothing and the control would just be a confusing switch. -->
  <InstallApp permanent />

  <!-- Invitations. Sits above Regions because it is the one section here that is waiting on the
         reader, and it is the only place an invitation can be found once the mail is gone. -->
  {#if invitations.length > 0}
    <SettingSection title={m.settings_invitations()}>
      <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
        {#each invitations as invitation (invitation.id)}
          <div class="flex items-center justify-between gap-4 p-4">
            <span class="min-w-0">
              <span class="block truncate">{invitation.regionName}</span>
              {#if invitation.invitedBy != null}
                <span class="text-surface-600-400 block truncate text-xs">
                  {m.region_invitedBy({ name: invitation.invitedBy })}
                </span>
              {/if}
            </span>

            <button
              type="button"
              class="btn btn-sm preset-filled-primary-500 flex-none"
              disabled={joining === invitation.id}
              onclick={() => onJoin(invitation)}
            >
              {m.invite_accept()}
            </button>
          </div>
        {/each}
      </div>
    </SettingSection>
  {/if}

  <!-- Regions. The section shows even with none, because the only way to start a second one (or a
       first, for somebody who left theirs) is the link at the bottom of it. -->
  <SettingSection title={m.settings_regions()}>
    <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
      {#each global.userRegions as region (region.regionFk)}
        <SettingLink
          href={resolve('/(app)/settings/regions/[regionId]', { regionId: String(region.regionFk) })}
          label={region.name}
          value={roleLabel(region.role)}
        />
      {/each}

      <SettingLink href={resolve('/(app)/regions/new')} label={m.region_new()} />
    </div>
  </SettingSection>

  <!-- Admin. Hidden for everyone else; the query behind the page rejects them regardless. -->
  {#if global.userPermissions?.includes(APP_PERMISSION_ADMIN)}
    <SettingSection title={m.settings_admin()}>
      <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
        <SettingLink href={resolve('/settings/errors')} label={m.settings_errorLogs()} />
      </div>
    </SettingSection>
  {/if}

  <!-- Legal -->
  <SettingSection title={m.settings_legal()}>
    <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
      {#each legalPages as link (link.href)}
        <SettingLink href={link.href} label={link.label} />
      {/each}
    </div>
  </SettingSection>

  <button type="button" class="btn preset-tonal-error w-full gap-2" onclick={signOut}>
    <Icon name="log-out" size={18} />
    {m.settings_signOut()}
  </button>
</div>
