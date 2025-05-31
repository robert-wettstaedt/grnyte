<script lang="ts">
  import { slide } from 'svelte/transition'
  import type { FeatureData } from '../../BlocksMap.svelte'
  import FeatureCard from '../FeatureCard'

  interface Props {
    features: FeatureData[]
  }

  const { features }: Props = $props()

  let container: HTMLDivElement | undefined = $state(undefined)

  $effect(() => {
    if (features.length === 0) {
      return
    }

    container?.scrollTo({ left: 0, behavior: 'instant' })
  })
</script>

{#if features.length > 0}
  <div
    bind:this={container}
    class="absolute right-1 bottom-1 left-1 z-10 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth"
    transition:slide={{ duration: 100 }}
  >
    {#each features as feature (feature.pathname ?? `geolocation-${feature.geolocation?.id}`)}
      <div class="shrink-0 snap-start {features.length > 1 ? 'w-[calc(100%-2rem)] md:w-[calc(50%-2rem)]' : 'w-full'}">
        <FeatureCard {feature} />
      </div>
    {/each}
  </div>
{/if}
