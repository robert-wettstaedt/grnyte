<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PageHeaderAction from '$lib/components/PageHeader/PageHeaderAction.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { powerSyncOnly } from '$lib/powersync/db.svelte'
  import { pageLoads } from '$lib/powersync/loads'
  import { motion } from '$lib/state/motion.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { notifyError } from '$lib/state/toast'
  import { slide } from 'svelte/transition'
  import { syncHealth, type SyncHealth } from './syncHealth.remote'

  const query = syncHealth()
  const health = remoteResource(query)

  let refreshing = $state(false)

  const refresh = async () => {
    refreshing = true
    try {
      await query.refresh()
    } catch (cause) {
      notifyError(cause)
    } finally {
      refreshing = false
    }
  }

  const STATUS = {
    healthy: { badge: 'preset-tonal-success', label: m.settings_syncHealthy },
    unhealthy: { badge: 'preset-tonal-warning', label: m.settings_syncUnhealthy },
    unreachable: { badge: 'preset-tonal-error', label: m.settings_syncUnreachable },
  }

  const loadTime = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'short', timeStyle: 'medium' })

  const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const

  // SI steps, which is what Intl's kilobyte and megabyte mean; abs so a negative safe_wal_size scales.
  const bytes = (value: null | number | undefined) => {
    if (value == null) return '?'
    const power = Math.min(UNITS.length - 1, Math.floor(Math.log10(Math.max(Math.abs(value), 1)) / 3))
    const format = { maximumFractionDigits: 1, style: 'unit', unit: UNITS[power], unitDisplay: 'narrow' } as const
    return new Intl.NumberFormat(getLocale(), format).format(value / 1000 ** power)
  }

  // An unparseable time is itself why the row failed: shown as sent, never formatted.
  const checkpointLabel = (at: null | string | undefined) => {
    if (!at) return m.settings_syncNever()
    const time = Date.parse(at)
    return Number.isFinite(time) ? formatUploadedAt(time, Date.now(), getLocale()) : at
  }

  const rows = (h: SyncHealth) => [
    { failed: h.reasons.includes('lag'), label: m.settings_syncLag(), value: bytes(h.lagBytes) },
    { failed: h.reasons.includes('walHeadroom'), label: m.settings_syncWalHeadroom(), value: bytes(h.safeWalSize) },
    { failed: h.reasons.includes('wal'), label: m.settings_syncWalStatus(), value: h.walStatus ?? '?' },
    {
      failed: h.reasons.includes('checkpoint'),
      label: m.settings_syncLastCheckpoint(),
      value: checkpointLabel(h.lastCheckpoint),
    },
    { failed: h.reasons.includes('errors'), label: m.settings_syncErrors(), value: String(h.errorCount ?? 0) },
  ]
</script>

<svelte:head>
  <title>{m.settings_syncHealth()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<PageHeader onback={() => back(resolve('/settings'))} title={m.settings_syncHealth()}>
  {#snippet action()}
    <PageHeaderAction
      disabled={refreshing}
      icon="rotate-ccw"
      label={m.common_refresh()}
      onclick={refresh}
      pending={refreshing}
    />
  {/snippet}
</PageHeader>

<div class="container mx-auto max-w-3xl space-y-4 px-4 py-8 pb-24 md:pb-8">
  <p class="text-surface-600-400 text-sm">{m.settings_syncHealthHint()}</p>

  <QueryState resource={health}>
    {#snippet ready(h)}
      <div class="divide-surface-200-800 border-surface-200-800 divide-y overflow-hidden rounded-xl border">
        <div class="flex items-center justify-between gap-3 p-4">
          <!-- The engine's own name, untranslated; its version only when the service answered. -->
          <span class="flex items-baseline gap-1.5">
            <span class="text-sm font-semibold">PowerSync</span>
            {#if h.version}<span class="text-surface-600-400 text-xs tabular-nums">{h.version}</span>{/if}
          </span>
          <span class="badge {STATUS[h.status].badge}">{STATUS[h.status].label()}</span>
        </div>

        {#if h.status !== 'unreachable'}
          <dl class="divide-surface-200-800 divide-y" transition:slide={{ duration: motion() }}>
            {#each rows(h) as row (row.label)}
              <div class="flex items-center justify-between gap-3 p-4">
                <dt class="text-surface-600-400 text-sm">{row.label}</dt>
                <dd class={['text-sm tabular-nums', row.failed && 'text-error-600-400 font-semibold']}>
                  {row.value}{#if row.failed}<span class="sr-only">{` (${m.settings_syncFailed()})`}</span>{/if}
                </dd>
              </div>
            {/each}
          </dl>
        {:else}
          <p class="text-error-600-400 p-4 text-sm" transition:slide={{ duration: motion() }}>
            {h.reasons.includes('unauthorized') ? m.settings_syncUnauthorized() : m.settings_syncUnreachableHint()}
          </p>
        {/if}
      </div>
    {/snippet}
  </QueryState>

  {#if powerSyncOnly()}
    <!-- The remeasure's reload counter; read once per visit, which is all a soak check needs. -->
    {@const loads = pageLoads()}
    <div class="border-surface-200-800 space-y-2 rounded-xl border p-4">
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm font-semibold">{m.settings_syncPageLoads()}</span>
        <span class="text-sm tabular-nums">{loads.length}</span>
      </div>
      <p class="text-surface-600-400 text-sm">{m.settings_syncPageLoadsHint()}</p>
      <ol class="text-surface-600-400 text-sm tabular-nums">
        {#each [...loads].reverse().slice(0, 10) as at (at)}
          <li>{loadTime.format(at)}</li>
        {/each}
      </ol>
    </div>
  {/if}
</div>
