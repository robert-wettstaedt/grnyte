<script lang="ts">
  import Layout, { type LayoutProps } from '$lib/components/Layout'
  import '@fortawesome/fontawesome-free/css/all.css'
  import '../../app.css'

  let { children }: LayoutProps = $props()
</script>

<Layout {children} />
