<!--
  The full emoji set, behind the quick row's `+`.

  `emoji-picker-element` is a plain custom element, so it needs no framework binding: search and
  skin tones come with it. Its own frequently-used row does not: two lists of favourites in one
  control, one fixed and one that quietly reorders, is one list too many, and the quick row is
  already the answer to "the emoji I always send".

  Loaded on demand. It is roughly 50KB plus its data, and most readers never open it.
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
   * "This gesture is mine", said to the bottom sheet.
   *
   * An open sheet locks the page behind it by putting `preventDefault` on `touchmove` and `wheel`
   * at the document. Its own scrollable children are spared because the sheet stops those events
   * propagating first, which it decides by walking up from the event target looking for something
   * that scrolls. This element's scroller is in a shadow root, the target retargets to the host,
   * and every ancestor above fits its content exactly: the walk finds nothing, the lock applies,
   * and the emoji list cannot be scrolled by touch or by wheel.
   *
   * So the picker says it itself. The sheet keeps its drag handle and its header; what it loses is
   * dragging the sheet by the emoji grid, which was never a gesture worth having over a list.
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
  /* Styles set on the host from out here beat the element's own `:host` rules, which is the whole
     mechanism: the picker themes itself from `prefers-color-scheme`, and this app themes itself
     from a class on <html> that a reader can set against their system. Left alone, a dark picker
     lands in a light app the moment those two disagree.

     `color-scheme: inherit` is what actually settles it. Skeleton's surface tokens are
     `light-dark()` pairs, so every colour below resolves from the used colour scheme rather than
     from the media query, and the picker follows the app by construction. It also hands the
     search field and the scrollbar the right native rendering. */
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
