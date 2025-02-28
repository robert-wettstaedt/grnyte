<script lang="ts">
  import Layout, { type LayoutProps } from '$lib/components/Layout'
  import '@fortawesome/fontawesome-free/css/all.css'
  import '../../app.postcss'

  let { children }: LayoutProps = $props()
</script>

<Layout {children} />
