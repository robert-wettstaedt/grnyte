<script lang="ts">
  import { HeaderBar, type LayoutProps } from '$lib/components/Layout'
  import { initI18n } from '$lib/i18n'
  import '@fortawesome/fontawesome-free/css/all.css'
  import 'github-markdown-css/github-markdown-dark.css'
  import '../../../../app.css'

  let { children }: LayoutProps = $props()

  initI18n()
</script>

<HeaderBar />

<main>
  {@render children?.()}
</main>
