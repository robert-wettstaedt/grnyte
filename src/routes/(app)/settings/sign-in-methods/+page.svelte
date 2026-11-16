<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { signInMethodsQuery, unlinkProvider } from '$lib/auth/identities.remote'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import SettingLink from '$lib/components/Setting/SettingLink.svelte'
  import SettingSection from '$lib/components/Setting/SettingSection.svelte'
  import SkeletonRows from '$lib/components/Skeleton/SkeletonRows.svelte'
  import { m } from '$lib/paraglide/messages'
  import { back, replaceUrl } from '$lib/state/navigation.svelte'
  import { notifyError, toaster } from '$lib/state/toast'
  import { onMount } from 'svelte'
  import ProviderRow from './ProviderRow.svelte'
  import SignedInDevices from './SignedInDevices.svelte'

  type Provider = 'apple' | 'google'
  type Step = `${'add' | 'remove'}-${Provider}`

  const PROVIDERS: Provider[] = ['apple', 'google']
  const NAMES: Record<Provider, string> = { apple: 'Apple', google: 'Google' }
  const HERE = '/settings/sign-in-methods'

  const query = signInMethodsQuery()
  const methods = remoteResource(query)

  // A return from Apple or a link start carries `?step=`, which reopens that row's step.
  const landedOn = page.url.searchParams.get('step')
  let pressed = $state<null | Step | undefined>(undefined)
  let running = $state(false)

  const canAdd = (provider: Provider) =>
    methods.data != null && !methods.data.providers[provider].linked && methods.data.configured.includes(provider)
  const canRemove = (provider: Provider) => methods.data?.providers[provider].linked === true
  const offers = (step: string) => {
    const [verb, provider] = step.split('-') as ['add' | 'remove', Provider]
    return PROVIDERS.includes(provider) && (verb === 'add' ? canAdd(provider) : canRemove(provider))
  }
  // A `step` for a row that no longer has that action (Apple already removed) opens nothing.
  const open = $derived(
    pressed !== undefined ? pressed : landedOn != null && offers(landedOn) ? (landedOn as Step) : null,
  )
  const appleAvailable = $derived(
    methods.data != null && methods.data.providers.apple.linked && methods.data.configured.includes('apple'),
  )

  onMount(() => {
    const linked = page.url.searchParams.get('linked')
    if (linked !== 'apple' && linked !== 'google') return
    toaster.create({ title: m.settings_signInMethodsAdded({ provider: NAMES[linked] }), type: 'success' })
    void replaceUrl(resolve(HERE))
  })

  async function remove(provider: Provider) {
    running = true
    try {
      const { othersSignedOut } = await unlinkProvider({ provider })
      await query.refresh()
      pressed = null
      toaster.create({ title: m.settings_signInMethodsRemoved({ provider: NAMES[provider] }), type: 'success' })
      if (othersSignedOut) toaster.create({ title: m.settings_signInMethodsOthersSignedOut(), type: 'info' })
      if (landedOn != null) void replaceUrl(resolve(HERE))
    } catch (cause) {
      notifyError(cause)
    } finally {
      running = false
    }
  }
</script>

<svelte:head>
  <title>{m.settings_signInMethods()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/settings'))} title={m.settings_signInMethods()} />

<div class="container mx-auto max-w-2xl space-y-8 px-4 py-8 pb-24 md:pb-8">
  <SettingSection title={m.settings_signInMethods()}>
    <QueryState resource={methods}>
      {#snippet loading()}
        <SkeletonRows class="p-4" count={3} />
      {/snippet}
      {#snippet ready(data)}
        <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
          <SettingLink
            href={resolve('/settings/password')}
            label={m.settings_signInMethodsPassword()}
            description={data!.hasPassword ? m.settings_signInMethodsSet() : m.settings_signInMethodsNotSet()}
            value={data!.hasPassword ? undefined : m.settings_setPassword()}
          />
          {#each PROVIDERS as provider (provider)}
            {@const step: Step = `${data!.providers[provider].linked ? 'remove' : 'add'}-${provider}`}
            <ProviderRow
              {appleAvailable}
              configured={data!.configured.includes(provider)}
              onremove={() => remove(provider)}
              ontoggle={() => (pressed = open === step ? null : step)}
              open={open === step}
              {provider}
              {running}
              identity={data!.providers[provider]}
            />
          {/each}
        </div>
      {/snippet}
    </QueryState>
  </SettingSection>

  <SignedInDevices />
</div>
