<script lang="ts" module>
  import { m } from '$lib/paraglide/messages'

  // A closed set: any other `reason` reads as `failed`. Never shows an address or a provider.
  const REASONS = {
    conflict_email: {
      action: m.auth_oauthBack,
      body: m.auth_oauthConflictEmailBody,
      title: m.auth_oauthConflictEmailTitle,
    },
    conflict_identity: {
      action: m.auth_oauthBack,
      body: m.auth_oauthConflictIdentityBody,
      title: m.auth_oauthConflictIdentityTitle,
    },
    exists: { action: m.auth_oauthBack, body: m.auth_oauthExistsBody, title: m.auth_oauthExistsTitle },
    expired: { action: m.auth_oauthTryAgain, body: m.auth_oauthExpiredBody, title: m.auth_oauthExpiredTitle },
    failed: { action: m.auth_oauthTryAgain, body: m.auth_oauthFailedBody, title: m.auth_oauthFailedTitle },
    offline: { action: m.auth_oauthTryAgain, body: m.auth_oauthOfflineBody, title: m.auth_oauthOfflineTitle },
  }
</script>

<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { oauthReturnTarget } from '$lib/auth'

  // Where /auth/confirm sends a link it could not verify (no `reason`), and where a sign-in with
  // Apple or Google ends that could not finish. No server load, so the offline shell renders it.
  const params = $derived(page.url.searchParams)
  const reason = $derived(params.get('reason'))
  const copy = $derived(
    reason == null ? null : Object.hasOwn(REASONS, reason) ? REASONS[reason as keyof typeof REASONS] : REASONS.failed,
  )
  const title = $derived(copy?.title() ?? m.auth_linkInvalid())
  const back = $derived(oauthReturnTarget(params.get('from'), params.get('intent')))
</script>

<svelte:head>
  <title>{title} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="card preset-tonal-error px-4 py-6 text-center text-sm">
  <h1 class="font-bold outline-none" tabindex="-1" {@attach (heading) => heading.focus()}>{title}</h1>
  {#if copy == null}
    <p class="text-surface-600-400 mt-1" role="alert">{m.auth_linkInvalidBody()}</p>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `?form=signin`: the form, never the welcome fork -->
    <a href={resolve('/auth/signin') + '?form=signin'} class="text-primary-400 mt-3 inline-block font-bold">
      {m.auth_backToSignIn()}
    </a>
  {:else}
    <p class="text-surface-600-400 mt-1" role={reason === 'offline' ? 'status' : undefined}>{copy.body()}</p>
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `oauthReturnTarget` answers a checked same-origin path -->
    <a href={back} class="text-primary-400 mt-3 inline-block font-bold">{copy.action()}</a>
  {/if}
</div>
