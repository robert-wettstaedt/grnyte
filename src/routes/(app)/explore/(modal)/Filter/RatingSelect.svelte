<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** Minimum rating to keep; `0` means no rating filter ("any"). */
    value: number
    max?: number
  }

  let { value = $bindable(), max = 3 }: Props = $props()

  const stars = $derived(Array.from({ length: max }, (_, index) => index + 1))

  // Tapping the currently-selected star clears the filter back to "any".
  const select = (star: number) => {
    value = value === star ? 0 : star
  }
</script>

<div class="flex items-center justify-between">
  <span class="text-sm font-medium">{m.filter_rating()}</span>

  <div class="flex items-center gap-2">
    <span class="text-surface-600-400 text-sm tabular-nums">
      {value === 0 ? m.common_any() : `${value}+`}
    </span>

    <div class="flex items-center gap-0.5" role="radiogroup" aria-label={m.filter_rating()}>
      {#each stars as star (star)}
        <button
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={m.filter_ratingMin({ count: star })}
          class={['transition-transform hover:scale-110', star <= value ? 'text-amber-500' : 'text-surface-400-600']}
          onclick={() => select(star)}
        >
          <Icon name="star" size={28} fill={star <= value ? 'currentColor' : 'none'} />
        </button>
      {/each}
    </div>
  </div>
</div>
