<script lang="ts">
  import { signedInDevices, signOutDevice, signOutOthers } from '$lib/auth/session.remote'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import SettingSection from '$lib/components/Setting/SettingSection.svelte'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { motion } from '$lib/state/motion.svelte'
  import { notifyError, toaster } from '$lib/state/toast'
  import { slide } from 'svelte/transition'
  import MethodRow, { rowAction } from './MethodRow.svelte'
  import MethodRowSkeleton from './MethodRowSkeleton.svelte'

  // Last on the screen: its row count is unknown until it loads, so it never pushes content down.
  const query = signedInDevices()
  const devices = remoteResource(query)

  let pending = $state<null | string>(null)

  const day = $derived(new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'short' }))
  // German puts the time first ("vor 2 Stunden aktiv"), so the line's first letter is raised here.
  const active = (at: Date) => {
    const line = m.settings_deviceActive({ time: formatUploadedAt(new Date(at).getTime(), Date.now(), getLocale()) })
    return line.charAt(0).toUpperCase() + line.slice(1)
  }

  async function run(key: string, action: () => Promise<unknown>) {
    pending = key
    try {
      await action()
      await query.refresh()
      return true
    } catch (cause) {
      notifyError(cause)
      return false
    } finally {
      pending = null
    }
  }

  async function others() {
    if (await run('others', () => signOutOthers()))
      toaster.create({ title: m.settings_signInMethodsOthersSignedOut(), type: 'success' })
  }
</script>

<div class="border-surface-200-800 rounded-xl border">
  <MethodRow icon="log-out" status={m.settings_otherDevicesHint()} title={m.settings_otherDevices()}>
    {#snippet action()}
      <button type="button" class={[rowAction, 'flex items-center gap-2']} disabled={pending != null} onclick={others}>
        <LoadingIndicator class={pending === 'others' ? '' : 'hidden'} size="16px" />
        {m.settings_deviceSignOut()}
      </button>
    {/snippet}
  </MethodRow>
</div>

<SettingSection title={m.settings_devices()}>
  <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
    <QueryState resource={devices}>
      {#snippet loading()}
        <div class="skeleton-hold" aria-busy="true"><MethodRowSkeleton /></div>
      {/snippet}
      {#snippet ready(rows)}
        {#each rows as device, index (device.id)}
          <div
            class={[index > 0 && 'border-surface-200-800 border-t']}
            out:slide={{ duration: motion(150) }}
            data-device
          >
            <MethodRow
              icon="monitor-smartphone"
              on={device.current}
              status={device.current ? m.settings_deviceThis() : active(device.activeAt)}
              title={m.settings_deviceSignedIn({ date: day.format(new Date(device.signedInAt)) })}
            >
              {#snippet action()}
                {#if !device.current}
                  <button
                    type="button"
                    class={[rowAction, 'flex items-center gap-2']}
                    disabled={pending != null}
                    onclick={() => run(device.id, () => signOutDevice({ id: device.id }))}
                  >
                    <LoadingIndicator class={pending === device.id ? '' : 'hidden'} size="16px" />
                    {m.settings_deviceSignOut()}
                  </button>
                {/if}
              {/snippet}
            </MethodRow>
          </div>
        {/each}
      {/snippet}
    </QueryState>
  </div>
</SettingSection>
