<!-- An admin screen in any state but ready: the header and a way back always, then the state given,
     or while the region row is not here a spinner, and offline the notice nothing will resolve. -->
<script lang="ts">
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { isOnline } from '$lib/state/online.svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    backTo: string
    children?: Snippet
    title: string
  }

  const { backTo, children, title }: Props = $props()
</script>

<div class="flex min-h-full flex-col">
  <PageHeader onback={() => back(backTo)} {title} />
  {#if children}
    <div class="mx-auto flex w-full max-w-screen-sm flex-1 flex-col px-4 py-6">{@render children()}</div>
  {:else if isOnline()}
    <LoadingIndicator class="flex flex-1 items-center justify-center" size={20} />
  {:else}
    <div class="mx-auto w-full max-w-screen-sm px-4 py-6"><OfflineNotice /></div>
  {/if}
</div>
