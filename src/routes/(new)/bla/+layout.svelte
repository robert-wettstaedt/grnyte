<script lang="ts">
  import { page } from '$app/state'
  import PageStateLoader from '$lib/components/Layout/components/PageStateLoader'
  import { initI18n } from '$lib/i18n'
  import type { LayoutProps } from './$types'

  let { children }: LayoutProps = $props()

  initI18n()
</script>

{#if page.data.session?.user == null}
  {@render children?.()}
{:else}
  <PageStateLoader>
    {@render children?.()}
  </PageStateLoader>
{/if}
