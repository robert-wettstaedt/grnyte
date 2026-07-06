<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'

  // Interactive sibling of RouteRating: 1–3 star quality picker. Tapping the current
  // rating again clears it, most routes should stay unrated.
  interface Props {
    /** When set, the rating submits through a hidden input with this name (empty when unrated). */
    name?: string
    /** 0 = no rating. */
    value?: number
  }

  let { name, value = $bindable(0) }: Props = $props()

  const labels = [m.routes_form_rating0(), m.routes_form_rating1(), m.routes_form_rating2(), m.routes_form_rating3()]
  const hints = [
    m.routes_form_rating0Hint(),
    m.routes_form_rating1Hint(),
    m.routes_form_rating2Hint(),
    m.routes_form_rating3Hint(),
  ]
</script>

{#if name != null}
  <input {name} type="hidden" value={value === 0 ? '' : value} />
{/if}

<div class="flex items-center gap-4">
  <div class="flex gap-1.5" role="radiogroup" aria-label={m.routes_form_ratingLabel()}>
    {#each [1, 2, 3] as star (star)}
      <button
        aria-checked={value === star}
        aria-label={labels[star]}
        class="border-surface-300-700 bg-surface-100-900 hover:bg-surface-200-800 flex size-12 items-center justify-center rounded-xl border"
        onclick={() => (value = value === star ? 0 : star)}
        role="radio"
        type="button"
      >
        <span class={star <= value ? 'text-(--st-flash)' : 'text-surface-500'}>
          <Icon name="star" size={24} fill={star <= value ? 'currentColor' : 'none'} />
        </span>
      </button>
    {/each}
  </div>

  <div class="min-w-0 flex-1">
    <div class="text-sm font-bold tracking-tight">{labels[value]}</div>
    <!-- min-h-[2lh]: longest hint wraps to 2 lines on narrow screens; reserve the space so switching ratings doesn't shift layout -->
    <div class="text-surface-600-400 mt-0.5 min-h-[2lh] text-xs">{hints[value]}</div>
  </div>
</div>
