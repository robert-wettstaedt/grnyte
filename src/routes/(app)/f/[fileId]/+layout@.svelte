<script lang="ts">
  import { dev } from '$app/environment'
  import { HeaderBar, type LayoutProps } from '$lib/components/Layout'
  import '@fortawesome/fontawesome-free/css/all.css'
  import { injectAnalytics } from '@vercel/analytics/sveltekit'
  import 'github-markdown-css/github-markdown-dark.css'
  import '../../../../app.css'

  injectAnalytics({ mode: dev ? 'development' : 'production' })

  let { children }: LayoutProps = $props()
</script>

<HeaderBar />

<main>
  {@render children?.()}
</main>
