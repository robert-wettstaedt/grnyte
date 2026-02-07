<script lang="ts">
  import { afterNavigate } from '$app/navigation'
  import { toaster } from '$lib/components/Toaster'
  import { getI18n } from '$lib/i18n'
  import { useRegisterSW } from 'virtual:pwa-register/svelte'

  const { needRefresh, updateServiceWorker } = useRegisterSW({
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

  const { t } = getI18n()

  afterNavigate(() => {
    requestAnimationFrame(() => {
      if ($needRefresh) {
        refreshApp()
      }
    })
  })

  function refreshApp() {
    const forms = document.querySelectorAll('form[method="post"]')

    if (forms.length === 0) {
      toaster.promise(updateServiceWorker(true), {
        loading: { title: t('updates.updatingApp') },
        success: { title: t('updates.updatedApp') },
        error: { title: t('updates.unableToUpdate') },
      })
    }
  }
</script>
