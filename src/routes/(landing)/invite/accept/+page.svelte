<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import { acceptPath } from '$lib/entities/region/dto'
  import { acceptRegionInvitation } from '$lib/entities/region/regions.remote'
  import { resolveErrorMessage } from '$lib/forms/issue'
  import { m } from '$lib/paraglide/messages'
  import type { PageProps } from './$types'
  import { signOut } from './signout.remote'

  // The one screen every invite path lands on: the emailed link, the signed-in bounce from
  // authGuard, and a reopened link. It localizes itself from the invitee's own browser
  // (paraglide's preferredLanguage), which is what makes a mis-guessed mail locale cost one
  // paragraph rather than the whole flow.
  const { data }: PageProps = $props()

  const token = $derived(page.url.searchParams.get('token') ?? '')
  const region = $derived(data.regionName ?? '')
  const inviter = $derived(data.inviter ?? PUBLIC_APPLICATION_NAME)

  // Sign up and sign in carry the invited address, because the invitation is keyed on it and a
  // mismatched signup silently orphans the invitation, plus `next` so signing in lands back here
  // rather than on /explore. Without that the invitee has to go back to their inbox and open the
  // emailed link a second time.
  //
  // Sign up needs no `next`: it cannot redirect (the address still has to be confirmed), and the
  // authGuard hook bounces the freshly confirmed, region-less user here on its own.
  const authHref = (path: string, next?: string) => {
    const params = [
      data.inviteEmail == null ? undefined : `email=${encodeURIComponent(data.inviteEmail)}`,
      next == null ? undefined : `next=${encodeURIComponent(next)}`,
    ].filter((param) => param != null)

    return params.length === 0 ? path : `${path}?${params.join('&')}`
  }

  const returnTo = $derived(token === '' ? undefined : acceptPath(token))

  // The three states nothing can be done about from here render as a terminal screen instead of a
  // form: icon tile, heading, one way out. Same shape as ErrorState, which owns the same job for
  // the signed-in half of the app but sends people to /explore, which an invitee may not have yet.
  const terminal = $derived.by(
    (): undefined | { body?: string; href: string; icon: IconName; tile: string; title: string } => {
      if (data.state === 'accepted') {
        const joined = data.sessionEmail === data.inviteEmail
        return {
          href: resolve('/explore'),
          icon: 'check',
          tile: 'bg-success-500/15 text-success-500',
          title: joined ? m.invite_accepted({ region }) : m.invite_alreadyUsed(),
        }
      }

      if (data.state === 'full') {
        return {
          body: m.invite_full({ inviter }),
          href: resolve('/'),
          icon: 'users-round',
          tile: 'bg-warning-500/15 text-warning-500',
          title: m.invite_fullTitle({ region }),
        }
      }

      if (data.state === 'invalid') {
        // Revoked and timed out present identically, by design: the next step is the same, ask the
        // inviter for a new link. Names them when we know who that was.
        return {
          body: data.inviter == null ? m.invite_notFound() : m.invite_expired({ inviter: data.inviter }),
          href: resolve('/'),
          icon: 'alert-triangle',
          tile: 'bg-error-500/15 text-error-500',
          title: m.invite_invalidTitle(),
        }
      }
    },
  )

  const ctaClass =
    'btn preset-filled-primary-500 h-12.5 w-full font-semibold shadow-[0_10px_28px_-12px_var(--color-primary-500)]'

  const dismissClass = 'text-surface-600-400 hover:text-surface-950-50 mt-4 self-center text-sm font-medium'

  let pending = $state(false)
  let failure = $state<string | undefined>(undefined)

  const join = async () => {
    pending = true
    failure = undefined

    try {
      await acceptRegionInvitation({ token })
      // A full page navigation, not `goto`: the Zero client is session scoped and preloads
      // `userRegions` at init, so a client-side navigation would sync nothing.
      location.href = resolve('/explore')
    } catch (cause) {
      failure = resolveErrorMessage(cause)
      pending = false
    }
  }
</script>

<svelte:head>
  <title>{terminal?.title ?? m.invite_title()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<!-- The labelled emergency exit, for the one caller who has somewhere to go: a member of another
     region who opened the emailed link. Nothing is written, because nothing needs to be - the
     invitation stays live and /settings lists it until it is accepted or times out. -->
{#snippet dismiss()}
  {#if data.canDismiss}
    <a href={resolve('/explore')} class={dismissClass}>{m.invite_notNow()}</a>
  {/if}
{/snippet}

<div class="bg-surface-50-950 text-surface-950-50 flex min-h-dvh flex-col items-center justify-center px-5 py-8">
  <div class="flex w-full max-w-100 flex-col">
    <a href={resolve('/')} class="mb-9 flex items-center gap-2.5 self-center">
      <img src={Logo} alt={PUBLIC_APPLICATION_NAME} class="block h-8 w-8 rounded-[9px]" />
      <strong class="[font-family:var(--heading-font-family)] text-[21px] font-bold tracking-tight">
        {PUBLIC_APPLICATION_NAME}
      </strong>
    </a>

    {#if data.state === 'valid'}
      <h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.invite_title()}</h1>
      <p class="text-surface-600-400 mb-6 text-[14.5px] leading-snug">
        {m.invite_invitedBy({ inviter, region })}
      </p>

      {#if failure != null}
        <p class="card preset-tonal-error mb-4 px-4 py-3 text-sm" role="alert">{failure}</p>
      {/if}

      {#if data.sessionEmail != null}
        <button type="button" class="{ctaClass} disabled:opacity-60" disabled={pending} onclick={join}>
          {m.invite_join({ region })}
        </button>

        {@render dismiss()}
      {:else}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- resolve()'d path plus a query
             string, which resolve() itself does not take -->
        <div class="flex flex-col gap-3">
          <a href={authHref(resolve('/auth/signup'))} class={ctaClass}>
            {m.invite_signUpCta()}
          </a>
          <a
            href={authHref(resolve('/auth/signin'), returnTo)}
            class="btn border-surface-300-700 text-surface-950-50 hover:bg-surface-200-800 h-12.5 w-full border bg-transparent font-semibold"
          >
            {m.invite_signInCta()}
          </a>
        </div>
      {/if}
    {:else if data.state === 'wrongAccount'}
      <h1 class="mb-1.5 text-[25px] font-bold tracking-tight">{m.invite_title()}</h1>
      <p class="text-surface-600-400 mb-6 text-[14.5px] leading-snug">
        {m.invite_wrongAccount({ current: data.sessionEmail ?? '', email: data.inviteEmail ?? '' })}
      </p>

      <form class="flex flex-col" {...signOut}>
        <input {...signOut.fields.token.as('hidden', token)} />
        <button type="submit" class="{ctaClass} disabled:opacity-60" disabled={signOut.pending > 0}>
          {m.invite_signOutCta()}
        </button>

        {@render dismiss()}
      </form>
    {:else if terminal != null}
      <div class="flex flex-col items-center text-center">
        <div class="flex size-20 items-center justify-center rounded-3xl {terminal.tile}">
          <Icon name={terminal.icon} size={36} />
        </div>

        <h1 class="mt-5 text-[25px] font-bold tracking-tight text-balance">{terminal.title}</h1>
        {#if terminal.body != null}
          <p class="text-surface-600-400 mt-3 text-[14.5px] leading-snug text-pretty">{terminal.body}</p>
        {/if}

        <a href={terminal.href} class="{ctaClass} mt-7">{m.invite_continue()}</a>
      </div>
    {/if}
  </div>
</div>
