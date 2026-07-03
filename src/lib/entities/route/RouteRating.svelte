<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'

  interface Props {
    /** Quality rating, 0–3 filled stars; the rest backfill as empty stars. */
    rating?: number | null
  }

  const { rating }: Props = $props()

  const filled = $derived(Math.min(3, Math.max(0, Math.round(rating ?? 0))))
</script>

<span class="flex flex-none items-center gap-px text-(--st-flash)" aria-label="{filled}/3">
  {#each [0, 1, 2] as star (star)}
    <Icon name="star" size={10} fill={star < filled ? 'currentColor' : 'none'} />
  {/each}
</span>
