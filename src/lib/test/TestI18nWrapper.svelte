<script lang="ts">
  import { initI18n } from '$lib/i18n'
  import i18next from 'i18next'
  export let Component: any
  export let props: Record<string, any> = {}
  export let lang: string = 'en'
  // set context during component init (required by Svelte)
  initI18n()
  // then switch language in background (no gating to avoid races)
  ;(async () => {
    try {
      if (i18next.language !== lang) {
        await i18next.changeLanguage(lang)
      }
    } catch {
      // ignore language switch errors in tests
    }
  })()
</script>

<svelte:component this={Component} {...props} />
