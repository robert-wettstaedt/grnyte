<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte'

  const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      r &&
        setInterval(async () => {
          if (r.installing || !navigator) return

          if ('connection' in navigator && !navigator.onLine) return

          const resp = await fetch(swUrl, {
            cache: 'no-store',
            headers: {
              cache: 'no-store',
              'cache-control': 'no-cache',
            },
          })

          if (resp?.status === 200) await r.update()
        }, 20000 /* 20s for testing purposes */)
    },
    onRegisterError(error) {
      console.log('SW registration error')
      console.log(error)
    },
  })

  const close = () => {
    offlineReady.set(false)
    needRefresh.set(false)
  }
</script>

{#if $needRefresh}
  <div
    class="border-surface-500 bg-surface-100 dark:bg-surface-800 fixed right-4 bottom-4 left-4 z-50 flex items-center gap-4 rounded-lg border p-4 shadow-lg md:left-auto"
    role="alert"
  >
    <div class="flex-1 text-sm">New app version available, click on reload button to update.</div>
    <div class="flex flex-col gap-2 md:flex-row">
      <button
        class="bg-primary-500 hover:bg-primary-600 rounded px-3 py-1 text-sm text-white"
        onclick={() => updateServiceWorker(true)}
      >
        Reload
      </button>
      <button
        class="border-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700 rounded border px-3 py-1 text-sm"
        onclick={close}
      >
        Close
      </button>
    </div>
  </div>
{/if}
