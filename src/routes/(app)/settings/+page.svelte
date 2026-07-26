<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import { roleLabel } from '$lib/entities/rolePermission/mapper'
  import type { GradingScale, UnitSystem } from '$lib/entities/user/dto'
  import { updateUserSettings } from '$lib/entities/user/users.remote'
  import { m } from '$lib/paraglide/messages'
  import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { toaster } from '$lib/state/toast'
  import { legalLinks } from '../../(landing)/legal/links'
  import SettingLink from './SettingLink.svelte'
  import SettingSection from './SettingSection.svelte'
  import SettingSelect from './SettingSelect.svelte'
  import ThemeSwitch from './ThemeSwitch.svelte'

  const global = getGlobalState()

  // The account's email lives in Supabase auth, not in our `users` row.
  const email = $derived(page.data.session?.user.email)

  // Local edit state seeded from the loaded settings (the app shell gates rendering until they
  // load, so `user` is present here). 'auto' is the UI value for "follow locale".
  let gradingScale = $state<GradingScale>(global.user?.userSettings?.gradingScale ?? 'FB')
  let unitSystem = $state<'auto' | UnitSystem>(global.user?.userSettings?.unitSystem ?? 'auto')

  const legalPages = legalLinks()

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
      toaster.create({ title: m.error_generic_title(), type: 'error' })
    }
  }

  const onUnitSystem = async (value: 'auto' | UnitSystem) => {
    const previous = unitSystem
    unitSystem = value
    try {
      await updateUserSettings({ unitSystem: value === 'auto' ? null : value })
    } catch {
      unitSystem = previous
      toaster.create({ title: m.error_generic_title(), type: 'error' })
    }
  }

  const signOut = async () => {
    // supabase is always present under (app); the guard just narrows the route-union type.
    const { supabase } = page.data
    if (supabase == null) return

    // signOut resolves with { error } rather than throwing; on failure the session survives, so
    // surface it instead of navigating to the landing page as if it worked.
    const { error } = await supabase.auth.signOut()
    if (error != null) {
      toaster.create({ title: m.error_generic_title(), type: 'error' })
      return
    }

    await goto(resolve('/'))
  }
</script>

<svelte:head>
  <title>{m.settings_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<main class="relative min-w-0 flex-1 overflow-y-auto">
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
          <span>{m.settings_language()}</span>
          <!-- Endonyms: each language is labelled in its own name (picker convention). setLocale
             sets the cookie and reloads to apply. -->
          <SettingSelect
            id="setting-language"
            value={getLocale()}
            onchange={(value) => setLocale(value)}
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

    <!-- Regions -->
    {#if global.userRegions.length > 0}
      <SettingSection title={m.settings_regions()}>
        <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
          {#each global.userRegions as region (region.regionFk)}
            <SettingLink
              href={resolve('/(app)/settings/regions/[regionId]', { regionId: String(region.regionFk) })}
              label={region.name}
              value={roleLabel(region.role)}
            />
          {/each}
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
</main>
