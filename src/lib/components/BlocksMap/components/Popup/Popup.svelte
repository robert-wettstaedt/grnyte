<script lang="ts">
  import { slide } from 'svelte/transition'
  import type { FeatureData } from '../../BlocksMap.svelte'
  import FeatureCard from '../FeatureCard'

  interface Props {
    features: FeatureData[]
  }

  const { features }: Props = $props()
</script>

{#if features.length > 0}
  <div
    class="absolute bottom-1 left-1 right-1 z-10 snap-x snap-mandatory scroll-smooth flex gap-4 overflow-x-auto"
    transition:slide={{ duration: 100 }}
  >
    {#each features as feature (feature.pathname)}
      <div class="snap-start shrink-0 {features.length > 1 ? 'w-[calc(100%-2rem)] md:w-[calc(50%-2rem)]' : 'w-full'}">
        <FeatureCard {feature} />
      </div>
    {/each}
  </div>
{/if}
