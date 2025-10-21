<script lang="ts">
  import Layout, { type LayoutProps } from '$lib/components/Layout'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'

  let { children }: LayoutProps = $props()
</script>

<svelte:boundary>
  {#snippet pending()}
    <div class="flex h-full items-center justify-center">
      <ProgressRing size="size-20" value={null} />
    </div>
  {/snippet}

  <Layout {children} />
</svelte:boundary>
