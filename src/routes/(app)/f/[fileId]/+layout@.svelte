<script lang="ts">
  import { HeaderBar, type LayoutProps } from '$lib/components/Layout'
  import '@fortawesome/fontawesome-free/css/all.css'
  import '../../../../app.postcss'

  let { data, children }: LayoutProps = $props()
</script>

<HeaderBar {data} />

<main>
  {@render children?.()}
</main>
