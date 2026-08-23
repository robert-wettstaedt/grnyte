<!--
  The full emoji set, behind the quick row's `+`. `emoji-picker-element` is a plain custom element
  needing no framework binding (search, skin tones included), but its own frequently-used row is
  disabled: the quick row above already covers "the emoji I always send", and two favourites lists
  is one too many. Loaded on demand, roughly 50KB plus data, since most readers never open it.
-->
<script lang="ts">
  import { getLocale, type Locale } from '$lib/paraglide/runtime'
  import deData from 'emoji-picker-element-data/de/cldr/data.json?url'
  import enData from 'emoji-picker-element-data/en/cldr/data.json?url'

  interface Props {
    onpick: (emoji: string) => void
  }

  const { onpick }: Props = $props()

  // Self-hosted, emitted as an asset by Vite rather than copied into `static/`: the element's
  // default is a jsdelivr fetch, which the CSP refuses and which an offline PWA start cannot make.
  // Per locale, so searching "Klettern" finds what searching "climbing" does.
  //
  // `emoji-picker-element-data`, NOT `emojibase-data`: emojibase 7 renamed `annotation` to
  // `label`, and the picker rejects that outright ("Emoji data is in the wrong format"). The
  // `cldr` build is the one both locales ship, and is half the size of the emojibase one.
  //
  // ponytail: the picker's own chrome (its search placeholder, its category names) stays English.
  // Its `i18n` option is a dozen more strings to translate, and the emoji names people actually
  // type at are in the data above. Fill it in when somebody notices.
  const DATA: Record<Locale, string> = { de: deData, en: enData }

  const picker = import('emoji-picker-element')

  // What the styling API below cannot reach, in through the shadow root, which is what the
  // element's own README says to do when the variables run out.
  const SHADOW_CSS = `
    .favorites { display: none }

    /* The sheet and the popover are the container here. A second rounded box drawn just inside
       theirs reads as a frame around the emoji rather than as the picker itself. */
    .picker { border: 0 }

    /* The skintone dropdown floats over the grid and paints itself with --background, which is
       transparent now, so it needs a surface of its own to stay readable. */
    .skintone-button-wrapper,
    .skintone-list { background: var(--color-surface-50-950) }
  `

  const onClick = (event: Event) => {
    const { unicode } = (event as CustomEvent<{ unicode?: string }>).detail
    if (unicode != null) {
      onpick(unicode)
    }
  }

  /**
   * The open sheet locks background scroll by walking up from the touch target for a scrollable
   * ancestor; this element's scroller lives in a shadow root, so the event retargets to the host
   * and the walk finds nothing. Stopping propagation here claims the gesture for the picker
   * instead, at the cost of not being able to drag the sheet via the emoji grid.
   */
  const claim = (event: Event) => event.stopPropagation()
</script>

{#await picker then _}
  <!-- The element ships a fixed 400px height and scrolls its own list inside it. Left alone in a
       container shorter than that, the container scrolls too, and the two scrollbars fight over
       every drag. `h-full` gives the list the whole box and leaves exactly one of them. -->
  <emoji-picker
    class="block h-full w-full"
    data-source={DATA[getLocale()] ?? enData}
    {@attach (node: HTMLElement) => {
      node.addEventListener('emoji-click', onClick)
      node.addEventListener('touchmove', claim)
      node.addEventListener('wheel', claim)

      const style = document.createElement('style')
      style.textContent = SHADOW_CSS
      node.shadowRoot?.append(style)

      return () => {
        node.removeEventListener('emoji-click', onClick)
        node.removeEventListener('touchmove', claim)
        node.removeEventListener('wheel', claim)
      }
    }}
  ></emoji-picker>
{/await}

<style>
  /* Host styles beat the element's own `:host` rules, but `color-scheme: inherit` is what actually
     keeps it themed with the app: the picker defaults to `prefers-color-scheme`, this app switches
     via a class on <html>, and Skeleton's `light-dark()` tokens below only follow the app if the
     colour scheme is inherited rather than read from the media query. */
  emoji-picker {
    color-scheme: inherit;

    /* The sheet and the popover both paint their own surface behind this. */
    --background: transparent;
    --border-color: var(--color-surface-200-800);
    --button-active-background: var(--color-surface-200-800);
    --button-hover-background: var(--color-surface-200-800);
    --category-font-color: var(--color-surface-600-400);
    --indicator-color: var(--color-primary-500);
    --input-border-color: var(--color-surface-300-700);
    --input-border-radius: var(--radius-container);
    --input-font-color: var(--color-surface-950-50);
    --input-placeholder-color: var(--color-surface-600-400);
    --outline-color: var(--color-primary-500);
  }
</style>
