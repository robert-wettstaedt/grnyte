<script lang="ts" module>
  import type { IconName } from '$lib/components/Icon/icons'
  import { m } from '$lib/paraglide/messages'

  interface Copy {
    action: 'back' | 'settings' | 'signin'
    body: () => string
    icon: IconName
    title: () => string
  }

  const settings = (icon: IconName, title: () => string, body: () => string): Copy => ({
    action: 'settings',
    body,
    icon,
    title,
  })

  // A closed set, conflicts keyed with their provider: anything else, a conflict without one
  // included, reads as `failed`. Never shows an address.
  const REASONS: Record<string, Copy> = {
    'conflict_email:apple': settings('mail', m.auth_oauthConflictEmailTitle, m.auth_oauthConflictEmailBodyApple),
    'conflict_email:google': settings('mail', m.auth_oauthConflictEmailTitle, m.auth_oauthConflictEmailBodyGoogle),
    'conflict_identity:apple': settings(
      'unlink',
      m.auth_oauthConflictIdentityTitleApple,
      m.auth_oauthConflictIdentityBodyApple,
    ),
    'conflict_identity:google': settings(
      'unlink',
      m.auth_oauthConflictIdentityTitleGoogle,
      m.auth_oauthConflictIdentityBodyGoogle,
    ),
    exists: { action: 'signin', body: m.auth_oauthExistsBody, icon: 'user-check', title: m.auth_oauthExistsTitle },
    expired: { action: 'back', body: m.auth_oauthExpiredBody, icon: 'clock', title: m.auth_oauthExpiredTitle },
    failed: { action: 'back', body: m.auth_oauthFailedBody, icon: 'alert-triangle', title: m.auth_oauthFailedTitle },
    offline: { action: 'back', body: m.auth_oauthOfflineBody, icon: 'cloud-off', title: m.auth_oauthOfflineTitle },
  }
</script>

<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { oauthReturnTarget } from '$lib/auth'
  import Icon from '$lib/components/Icon/Icon.svelte'

  // Where /auth/confirm sends a link it could not verify (no `reason`), and where a sign-in with
  // Apple or Google ends that could not finish. No server load, so the offline shell renders it.
  const params = $derived(page.url.searchParams)
  const reason = $derived(params.get('reason'))
  const copy = $derived.by(() => {
    if (reason == null) return null
    const key = reason.startsWith('conflict_') ? `${reason}:${params.get('provider')}` : reason
    return Object.hasOwn(REASONS, key) ? REASONS[key] : REASONS.failed
  })
  const title = $derived(copy?.title() ?? m.auth_linkInvalid())
  const signIn = resolve('/auth/signin') + '?form=signin'
  const href = $derived.by(() => {
    if (copy == null || copy.action === 'signin') return signIn
    return oauthReturnTarget(params.get('from'), params.get('intent'))
  })
  const label = $derived.by(() => {
    switch (copy?.action) {
      case undefined:
        return m.auth_backToSignIn()
      case 'settings':
        return m.auth_oauthBackToSettings()
      case 'signin':
        return m.auth_signIn()
      default:
        return m.auth_oauthTryAgain()
    }
  })
</script>

<svelte:head>
  <title>{title} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="mt-6.5 mb-4.5 flex flex-col items-center text-center min-[860px]:mt-0">
  <div
    class="bg-primary-500/16 text-primary-600-400 flex size-19 items-center justify-center rounded-[22px]"
    aria-hidden="true"
  >
    <Icon name={copy?.icon ?? 'mail'} size={34} strokeWidth={1.8} />
  </div>
  <h1
    class="mt-5.5 text-[23px] leading-tight font-bold tracking-tight text-balance shadow-none! outline-none"
    tabindex="-1"
    {@attach (heading) => heading.focus()}
  >
    {title}
  </h1>
  <p
    class="text-surface-600-400 mt-2.5 max-w-80 text-[14.5px] leading-normal text-pretty"
    role={copy == null ? 'alert' : reason === 'offline' ? 'status' : undefined}
  >
    {copy?.body() ?? m.auth_linkInvalidBody()}
  </p>
  <!-- eslint-disable svelte/no-navigation-without-resolve -- `oauthReturnTarget` answers a checked same-origin path -->
  <a
    {href}
    class="btn preset-filled-primary-500 mt-7 h-12.5 w-full max-w-80 font-semibold shadow-[0_10px_28px_-12px_var(--color-primary-500)]"
  >
    {label}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</div>
