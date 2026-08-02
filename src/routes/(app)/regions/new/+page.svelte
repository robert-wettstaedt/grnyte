<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { signOut } from '$lib/auth/session.remote'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { MAX_OWNED_REGIONS } from '$lib/entities/region/dto'
  import { createRegion } from '$lib/entities/region/regions.remote'
  import Form from '$lib/forms/Form.svelte'
  import FormError from '$lib/forms/FormError.svelte'
  import RemoteFormInputWrapper from '$lib/forms/RemoteFormInputWrapper.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import type { PageProps } from './$types'

  // One route, two framings. With no memberships the authGuard sent them here and there is nothing
  // else in the app for them yet, so the screen introduces itself and offers the two other doors
  // (a missed invitation, the demo). With memberships they came from settings and just want the
  // form. The cap state outranks both.
  const { data }: PageProps = $props()
  const global = getGlobalState()

  const welcome = $derived(global.userRegions.length === 0)
  const capped = $derived(data.owned.length >= MAX_OWNED_REGIONS)

  // Only the founded regions they can still open. `data.owned` counts by `regions.created_by`,
  // which keeps counting after the founder leaves (that is the point, it is what holds the cap),
  // so linking all of them offers settings screens that are no longer theirs to see.
  const reachable = $derived(
    data.owned.filter((region) => global.userRegions.some((membership) => membership.regionFk === region.id)),
  )

  let doorOpen = $state(false)

  const goBack = () => back(resolve('/settings'))

  /**
   * A document load rather than `goto`. The Zero client is session scoped and preloaded
   * `userRegions` at init, so a client-side navigation would land on a map that has never heard of
   * the region. Same reason the invite-accept screen reloads.
   */
  const onSubmitted = () => {
    const regionId = createRegion.result?.data?.regionId

    if (regionId == null) {
      return
    }

    location.href = welcome
      ? resolve('/explore')
      : resolve('/(app)/settings/regions/[regionId]', { regionId: String(regionId) })
  }
</script>

<svelte:head>
  <title>{welcome ? m.onboarding_title() : m.region_new()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#snippet signOutForm(className: string)}
  <!-- The only way out of a chromeless screen for somebody signed in as the wrong account, and the
       only one at all in the welcome framings: this group sits outside (shell), so there is no nav
       rail or tab bar, and authGuard bounces / and /explore straight back here. -->
  <form class={className} {...signOut}>
    <input {...signOut.fields.redirectTo.as('hidden', resolve('/(landing)/auth'))} />
    <button class="text-surface-600-400 hover:text-surface-950-50 px-4 py-3 text-sm font-medium" type="submit">
      {m.settings_signOut()}
    </button>
  </form>
{/snippet}

{#snippet nameField()}
  <RemoteFormInputWrapper
    class="space-y-2"
    field={createRegion.fields.name}
    hint={m.onboarding_nameHint()}
    id="region-name"
    label={m.settings_regionName()}
    required
  >
    {#snippet children(props)}
      <input
        {...createRegion.fields.name.as('text')}
        {...props}
        {@attach (node) => node.focus()}
        autocapitalize="words"
        autocomplete="off"
        class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-4 py-3 text-base font-semibold tracking-tight focus:ring-0 focus:outline-none"
        enterkeyhint="done"
        placeholder={m.onboarding_namePlaceholder()}
      />
    {/snippet}
  </RemoteFormInputWrapper>
{/snippet}

{#if capped}
  <!-- Reachable from the settings entry point, and from the bounce for the founder who left every
       region they made. Says why rather than disabling the button with no explanation. -->
  <div class="bg-surface-50-950 text-surface-950-50 flex min-h-dvh flex-col items-center justify-center px-5 py-8">
    <div class="flex w-full max-w-100 flex-col items-center text-center">
      <div class="bg-warning-500/15 text-warning-500 flex size-20 items-center justify-center rounded-3xl">
        <Icon name="layers" size={36} />
      </div>

      <!-- The number they actually own, not the constant: an account that founded regions before
           the cap existed (or one founded after it was lowered) is over it, and the headline must
           not contradict the list right below. -->
      <h1 class="mt-5 text-[25px] font-bold tracking-tight text-balance">
        {m.region_capTitle({ count: data.owned.length })}
      </h1>
      <p class="text-surface-600-400 mt-2 text-pretty">{m.region_capBody({ count: MAX_OWNED_REGIONS })}</p>

      <nav class="mt-7 flex w-full flex-col gap-2">
        {#each reachable as region (region.id)}
          <a
            class="border-surface-300-700 bg-surface-100-900 hover:bg-surface-200-800 flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors"
            href={resolve('/(app)/settings/regions/[regionId]', { regionId: String(region.id) })}
          >
            <span class="min-w-0 flex-1 truncate font-semibold">{region.name}</span>
            <Icon name="chevron-right" size={18} class="text-surface-500 flex-none" />
          </a>
        {/each}
      </nav>

      <!-- Two different exits, because the two ways in have different ones. From settings, back.
           From the bounce (a founder who left every region they made, so they are capped and
           region-less at once) there is nowhere in the app to go back to, and the regions listed
           above are ones they are no longer a member of. -->
      {#if welcome}
        {@render signOutForm('mt-4 flex justify-center')}
      {:else}
        <button class="text-surface-600-400 hover:text-surface-950-50 mt-4 text-sm font-medium" onclick={goBack}>
          {m.common_cancel()}
        </button>
      {/if}
    </div>
  </div>
{:else if welcome}
  <div class="bg-surface-50-950 text-surface-950-50 flex min-h-dvh flex-col items-center px-5 py-8">
    <div class="flex w-full max-w-100 flex-1 flex-col">
      <h1 class="text-[25px] font-bold tracking-tight">{m.onboarding_title()}</h1>
      <p class="text-surface-600-400 mt-1.5 text-[14.5px] leading-snug">{m.onboarding_subtitle()}</p>

      <form
        class="mt-7 flex flex-col gap-4"
        {...createRegion.enhance(async ({ submit }) => {
          if (await submit()) {
            onSubmitted()
          }
        })}
      >
        <FormError form={createRegion} />

        {@render nameField()}

        <button
          type="submit"
          class="btn preset-filled-primary-500 h-12.5 w-full font-semibold shadow-[0_10px_28px_-12px_var(--color-primary-500)] disabled:opacity-60"
          disabled={createRegion.pending > 0}
        >
          {m.region_create()}
        </button>
      </form>

      <!-- The two lesser doors. Quiet on purpose: nearly everybody here wants the form above. -->
      <div class="border-surface-300-700 mt-7 divide-y divide-current/10 overflow-hidden rounded-2xl border">
        <div>
          <button
            class="flex w-full items-center gap-3 px-3.5 py-3 text-left"
            onclick={() => (doorOpen = !doorOpen)}
            aria-expanded={doorOpen}
            type="button"
          >
            <span
              class="bg-surface-200-800 text-surface-600-400 flex size-9 flex-none items-center justify-center rounded-xl"
            >
              <Icon name="at-sign" size={18} />
            </span>

            <span class="min-w-0 flex-1">
              <span class="block text-[15px] font-semibold">{m.onboarding_inviteTitle()}</span>
              <span class="text-surface-600-400 block truncate text-xs">
                {m.onboarding_inviteSignedInAs({ email: data.email ?? '' })}
              </span>
            </span>

            <Icon
              name="chevron-down"
              size={17}
              class={['text-surface-500 flex-none transition-transform', doorOpen && 'rotate-180']}
            />
          </button>

          {#if doorOpen}
            <div class="space-y-2 py-1 pr-3.5 pb-3.5 pl-[3.75rem]">
              <p class="text-surface-600-400 text-[13.5px] leading-relaxed text-pretty">
                {m.onboarding_inviteBody()}
              </p>
              <a class="text-primary-400 text-[13.5px] font-semibold" href={resolve('/settings/email')}>
                {m.onboarding_inviteCta()}
              </a>
            </div>
          {/if}
        </div>

        <!-- A separate deployment with its own sign-in, so it opens in a new tab and leaves this
             screen standing. -->
        <a
          class="flex items-center gap-3 px-3.5 py-3"
          href="https://demo.grnyte.rocks"
          rel="noopener noreferrer"
          target="_blank"
        >
          <span
            class="bg-surface-200-800 text-surface-600-400 flex size-9 flex-none items-center justify-center rounded-xl"
          >
            <Icon name="mountain" size={18} />
          </span>

          <span class="min-w-0 flex-1">
            <span class="block text-[15px] font-semibold">{m.onboarding_demoTitle()}</span>
            <span class="text-surface-600-400 block text-xs text-pretty">{m.onboarding_demoBody()}</span>
          </span>
        </a>
      </div>

      {@render signOutForm('mt-auto flex justify-center pt-8')}
    </div>
  </div>
{:else}
  <Form form={createRegion} onCancel={goBack} {onSubmitted} submitLabel={m.region_create()} title={m.region_new()}>
    {@render nameField()}

    <p class="text-surface-500 mt-3 text-xs">
      {m.region_ownedCount({ owned: data.owned.length, total: MAX_OWNED_REGIONS })}
    </p>
  </Form>
{/if}
