<script lang="ts">
  import { signedInDevices, signOutDevice, signOutOthers } from '$lib/auth/session.remote'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { remoteResource } from '$lib/components/QueryState/remoteResource'
  import SettingSection from '$lib/components/Setting/SettingSection.svelte'
  import SkeletonRows from '$lib/components/Skeleton/SkeletonRows.svelte'
  import { formatUploadedAt } from '$lib/i18n/relativeTime'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { motion } from '$lib/state/motion.svelte'
  import { notifyError, toaster } from '$lib/state/toast'
  import { slide } from 'svelte/transition'

  // Last on the screen: its row count is unknown until it loads, so it never pushes content down.
  const query = signedInDevices()
  const devices = remoteResource(query)

  let pending = $state<null | string>(null)

  const when = (at: Date) => formatUploadedAt(new Date(at).getTime(), Date.now(), getLocale())

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
      toaster.create({ title: m.settings_signedOutOthers(), type: 'success' })
  }
</script>

<SettingSection title={m.settings_devices()}>
  <div class="divide-surface-200-800 border-surface-200-800 divide-y rounded-xl border">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-4 p-4 text-left"
      disabled={pending != null}
      onclick={others}
    >
      {m.settings_signOutOthers()}
      <LoadingIndicator class={pending === 'others' ? '' : 'hidden'} size="18px" />
    </button>

    <QueryState resource={devices}>
      {#snippet loading()}
        <SkeletonRows class="p-4" count={1} />
      {/snippet}
      {#snippet ready(rows)}
        {#each rows as device, index (device.id)}
          <div
            class={['flex items-center justify-between gap-4 p-4', index > 0 && 'border-surface-200-800 border-t']}
            out:slide={{ duration: motion(150) }}
            data-device
          >
            <span class="min-w-0">
              {#if device.current}
                <span class="block font-semibold">{m.settings_deviceThis()}</span>
              {/if}
              <span class="text-surface-600-400 block text-xs">
                {m.settings_deviceSignedIn({ date: when(device.signedInAt) })} · {m.settings_deviceActive({
                  time: when(device.activeAt),
                })}
              </span>
            </span>
            {#if !device.current}
              <button
                type="button"
                class="btn btn-sm preset-tonal-error flex-none gap-2"
                disabled={pending != null}
                onclick={() => run(device.id, () => signOutDevice({ id: device.id }))}
              >
                <LoadingIndicator class={pending === device.id ? '' : 'hidden'} size="16px" />
                {m.settings_deviceSignOut()}
              </button>
            {/if}
          </div>
        {/each}
      {/snippet}
    </QueryState>
  </div>
</SettingSection>
