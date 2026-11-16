<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { signInMethodsQuery, unlinkProvider } from '$lib/auth/identities.remote'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { m } from '$lib/paraglide/messages'
  import { back, replaceUrl } from '$lib/state/navigation.svelte'
  import { notifyError, toaster } from '$lib/state/toast'
  import { onMount } from 'svelte'
  import MethodRow, { rowAction } from './MethodRow.svelte'
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
      const removed = othersSignedOut ? m.settings_signInMethodsRemovedSignedOut : m.settings_signInMethodsRemoved
      toaster.create({ title: removed({ provider: NAMES[provider] }), type: 'success' })
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

<div class="container mx-auto flex max-w-2xl flex-col gap-5.5 px-4 py-8 pb-24 md:pb-8">
  <QueryState resource={methods}>
    {#snippet loading()}
      <!-- Always three rows: password, Apple, Google. -->
      <div
        class="border-surface-200-800 skeleton-hold divide-surface-200-800 divide-y rounded-xl border"
        aria-busy="true"
      >
        {#each [40, 30, 35] as width (width)}
          <div class="flex items-center gap-3 px-4 py-3.5">
            <span class="bg-surface-200-800 size-9 flex-none animate-pulse rounded-[10px]"></span>
            <span class="flex flex-1 flex-col gap-1.5">
              <span class="bg-surface-200-800 h-3.5 animate-pulse rounded" style:width="{width}%"></span>
              <span class="bg-surface-200-800 h-2.75 w-1/4 animate-pulse rounded"></span>
            </span>
          </div>
        {/each}
      </div>
    {/snippet}
    {#snippet ready(data)}
      <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
        <MethodRow
          icon="key"
          on={data!.hasPassword}
          status={data!.hasPassword ? m.settings_signInMethodsSet() : m.settings_signInMethodsNotSet()}
          title={m.settings_signInMethodsPassword()}
        >
          {#snippet action()}
            <a href={resolve('/settings/password')} class={rowAction}>
              {data!.hasPassword ? m.settings_signInMethodsChange() : m.settings_setPassword()}
            </a>
          {/snippet}
        </MethodRow>
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

  <SignedInDevices />
</div>
