<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { Attachment } from 'svelte/attachments'

  interface Props {
    children: Snippet
  }

  const { children }: Props = $props()

  // The scrolling toolbar (touch layout, see the media query below). We fade the
  // edge that has more content beyond it so the scrollability is discoverable.
  let canScrollLeft = $state(false)
  let canScrollRight = $state(false)

  const trackOverflow: Attachment<HTMLDivElement> = (el) => {
    const update = () => {
      // 1px slack absorbs sub-pixel rounding so a fully-scrolled edge reads as
      // "no more content" rather than flickering the fade on.
      canScrollLeft = el.scrollLeft > 1
      canScrollRight = el.scrollWidth - el.clientWidth - el.scrollLeft > 1
    }

    update()
    el.addEventListener('scroll', update, { passive: true })

    // Catches viewport resizes (and the wrap/scroll layout swap) changing which
    // edges overflow.
    const observer = new ResizeObserver(update)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }
</script>

<!-- A toolbar of `Action`s. Non-touch pointers (mouse/trackpad) wrap onto extra
     rows so every action stays reachable without scrolling — see the media
     query below for why touch displays scroll instead. -->
<div
  {@attach trackOverflow}
  class="actions flex flex-wrap gap-2"
  class:fade-left={canScrollLeft}
  class:fade-right={canScrollRight}
>
  {@render children()}
</div>

<style>
  /* The fade widths are animated, so the edge fades ease in and out as the user
     scrolls rather than popping. Registering them is also what lets the
     mask-image below react to the transition. */
  @property --fade-left {
    syntax: '<length>';
    inherits: false;
    initial-value: 0px;
  }
  @property --fade-right {
    syntax: '<length>';
    inherits: false;
    initial-value: 0px;
  }

  /* Touch displays get the original horizontally scrolling toolbar with snap; a
     finger can flick it, and the scrollbar is hidden so it reads as a clean
     bar. Non-touch pointers keep the wrapping default above, since a hidden
     scrollbar is awkward to scroll with a mouse wheel. */
  @media (pointer: coarse) {
    .actions {
      flex-wrap: nowrap;
      overflow-x: auto;
      scroll-snap-type: x proximity;
      scrollbar-width: none;
      -ms-overflow-style: none;

      /* Fade only the edges that have more content past them. `.fade-left` /
         `.fade-right` widen the corresponding side (toggled from JS); the mask
         paints relative to the scrollport, so the fades stay pinned to the
         visible edges as the content scrolls underneath. */
      -webkit-mask-image: linear-gradient(
        to right,
        transparent 0,
        black var(--fade-left),
        black calc(100% - var(--fade-right)),
        transparent 100%
      );
      mask-image: linear-gradient(
        to right,
        transparent 0,
        black var(--fade-left),
        black calc(100% - var(--fade-right)),
        transparent 100%
      );
      transition:
        --fade-left 0.15s ease,
        --fade-right 0.15s ease;
    }

    .actions::-webkit-scrollbar {
      display: none;
    }

    .actions.fade-left {
      --fade-left: 2rem;
    }

    .actions.fade-right {
      --fade-right: 2rem;
    }
  }
</style>
