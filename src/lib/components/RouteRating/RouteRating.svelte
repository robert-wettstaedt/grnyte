<script lang="ts">
  import { RatingGroup } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    value: number | null | undefined
  }

  let props: Props = $props()
  const value = $derived(props.value ?? 0)
</script>

<RatingGroup count={3} readOnly {value}>
  <RatingGroup.Control class="gap-0.5! text-xs md:text-sm">
    <RatingGroup.Context>
      {#snippet children(ratingGroup)}
        {#each ratingGroup().items as index (index)}
          <RatingGroup.Item {index}>
            {#snippet empty()}
              <i class="fa-regular fa-star text-warning-500 -mx-0.5"></i>
            {/snippet}
            {#snippet full()}
              <i class="fa-solid fa-star text-warning-500 -mx-0.5"></i>
            {/snippet}
          </RatingGroup.Item>
        {/each}
      {/snippet}
    </RatingGroup.Context>
  </RatingGroup.Control>
  <RatingGroup.HiddenInput />
</RatingGroup>
