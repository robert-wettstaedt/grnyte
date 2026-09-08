<script lang="ts">
  import { resolve } from '$app/paths'
  import type { ResolvedPathname } from '$app/types'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import { m } from '$lib/paraglide/messages'
  import { back, canGoBack } from '$lib/state/navigation.svelte'

  type ErrorType = 'generic' | 'notfound' | 'offline' | 'server'

  // Full-screen blocking error state: icon, heading, body and recovery buttons.
  // `type` selects the icon, tonal colour and default copy; the offline state
  // offers Reload, others offer Explore. Pass `title`/`description` to override.
  interface Props {
    description?: string
    /** Replaces the Explore button, which only a signed-in reader can open. Ignored when `type` is
     *  'offline', where the only useful action is Reload. */
    primaryAction?: { href: ResolvedPathname; label: string }
    title?: string
    type?: ErrorType
  }

  const { description, primaryAction, title, type = 'generic' }: Props = $props()

  const variants: Record<ErrorType, { body: () => string; icon: IconName; tile: string; title: () => string }> = {
    generic: {
      body: m.error_generic_body,
      icon: 'alert-triangle',
      tile: 'bg-error-500/15 text-error-500',
      title: m.error_generic_title,
    },
    notfound: {
      body: m.error_notfound_body,
      icon: 'map-pin-x',
      tile: 'bg-primary-500/15 text-primary-500',
      title: m.error_notfound_title,
    },
    offline: {
      body: m.error_offline_body,
      icon: 'no-signal',
      tile: 'bg-surface-200-800 text-surface-600-400',
      title: m.error_offline_title,
    },
    server: {
      body: m.error_server_body,
      icon: 'alert-triangle',
      tile: 'bg-error-500/15 text-error-500',
      title: m.error_server_title,
    },
  }

  const variant = $derived(variants[type])
  const exploreHref = resolve('/explore')
  const primaryHref = $derived(primaryAction?.href ?? exploreHref)
</script>

<div class="flex min-h-full flex-col items-center justify-center px-8 py-16 text-center">
  <div class="flex size-20 items-center justify-center rounded-3xl {variant.tile}">
    <Icon name={variant.icon} size={36} />
  </div>

  <h1 class="text-surface-950-50 mt-5 text-2xl font-bold tracking-tight text-balance">
    {title ?? variant.title()}
  </h1>
  <p class="text-surface-600-400 mt-3 max-w-xs text-pretty">
    {description ?? variant.body()}
  </p>

  <div class="mt-7 flex w-full max-w-xs flex-col gap-2.5">
    {#if type === 'offline'}
      <button class="btn preset-filled-primary-500" onclick={() => location.reload()} type="button">
        {m.error_reload()}
      </button>
    {:else}
      <a class="btn preset-filled-primary-500" href={primaryHref}>{primaryAction?.label ?? m.explore_title()}</a>
    {/if}
    {#if canGoBack()}
      <button class="btn preset-tonal-surface" onclick={() => back(primaryHref)} type="button">
        {m.common_back()}
      </button>
    {/if}
  </div>
</div>
