<script lang="ts" module>
  /** The CTA geometry this family shares: filled for the action we want taken, outlined for the
   *  alternative. Exported so the callers cannot drift apart. */
  export const EMPTY_CTA_PRIMARY =
    'btn preset-filled-primary-500 h-13.5 rounded-2xl text-base font-bold shadow-[0_10px_24px_-10px_var(--color-primary-500)]'
  export const EMPTY_CTA_SECONDARY =
    'btn border-surface-300-700 text-surface-950-50 hover:bg-surface-200-800 h-13.5 rounded-2xl border bg-transparent text-base font-semibold'

  /** The same two weights for an empty state that is a genuine fork, where the options lead
   *  somewhere different and the label alone cannot say where. Each carries its consequence on a
   *  second line, so the body paragraph does not have to describe the buttons. */
  const CHOICE = 'btn h-auto w-full justify-start gap-3 rounded-2xl px-4 py-3 text-left'
  export const EMPTY_CHOICE_PRIMARY = `${CHOICE} preset-filled-primary-500 shadow-[0_10px_24px_-10px_var(--color-primary-500)]`
  export const EMPTY_CHOICE_SECONDARY = `${CHOICE} border-surface-300-700 text-surface-950-50 hover:bg-surface-200-800 border bg-transparent`
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * The "nothing here yet, here is the next thing to make" state, shared by every level of the
   * containment chain: a region with no areas, an area with no children, a block with no routes.
   *
   * Extracted from the area version, which is where the treatment was designed. Keeping one
   * component is the point: these render one after another as a new region gets filled in, and
   * three hand-rolled variants drifted apart is exactly what that walk would expose.
   *
   * The illustration is line art on a soft glow inside a dashed ring, drawing itself in once.
   * `motif` picks the subject; everything around it is fixed so the family reads as one hand.
   *
   * The vertical rhythm is measured for a page, and on a phone this is never one: it renders at
   * the tail of a sheet that covers three quarters of the viewport. So the illustration and the
   * spacing scale with `svh`, which keeps the full treatment on a desktop panel and gets the
   * title and the calls to action above the fold on a short screen.
   */
  interface Props {
    /** Optional: skip it when the actions already say everything a paragraph would. */
    body?: string
    /** The calls to action. First one filled, any second one outlined, see the callers. */
    children?: Snippet
    motif: 'region' | 'routes' | 'sector'
    title: string
  }

  const { body, children, motif, title }: Props = $props()
</script>

<div class="es-fade flex flex-col items-center px-6 text-center">
  <!-- Decorative: the heading below carries the meaning. -->
  <div class="es-art relative">
    <div
      class="absolute inset-0 rounded-full"
      style="background:radial-gradient(circle at 50% 40%, color-mix(in oklab, var(--color-primary-500) 22%, transparent), transparent 68%)"
    ></div>

    <svg class="relative size-full" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle
        cx="60"
        cy="60"
        r="46"
        stroke="var(--color-surface-400)"
        stroke-width="1.5"
        stroke-dasharray="3 6"
        opacity="0.5"
      />

      {#if motif === 'sector'}
        <!-- A sector skyline with two anchors: what an area is waiting to be filled with. -->
        <path
          class="es-draw"
          d="M22 86 L48 40 L64 66 L78 44 L98 86 Z"
          stroke="var(--color-primary-400)"
          stroke-width="3"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <path
          d="M48 40 L55 50 L48 56 L54 64"
          stroke="var(--color-primary-400)"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          opacity="0.55"
        />
        <circle
          cx="48"
          cy="40"
          r="3.4"
          fill="var(--color-surface-100-900)"
          stroke="var(--color-primary-400)"
          stroke-width="2.4"
        />
        <circle
          cx="78"
          cy="44"
          r="3.4"
          fill="var(--color-surface-100-900)"
          stroke="var(--color-primary-400)"
          stroke-width="2.4"
        />
      {:else if motif === 'region'}
        <!-- A region boundary drawn around one small sector: the container, and the first thing
             that goes in it. -->
        <path
          class="es-draw"
          d="M28 46 C 34 26 74 20 92 36 C 106 50 99 84 77 94 C 55 104 25 89 28 46 Z"
          stroke="var(--color-primary-400)"
          stroke-width="3"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <path
          d="M44 78 L56 58 L64 70 L73 54 L84 78"
          stroke="var(--color-primary-400)"
          stroke-width="2.2"
          stroke-linejoin="round"
          stroke-linecap="round"
          opacity="0.55"
        />
      {:else}
        <!-- One line up a boulder, topped out: what a block is missing. -->
        <path
          class="es-draw"
          d="M28 92 C 23 66 34 40 58 34 C 82 28 99 48 96 72 C 94 85 87 92 78 92 Z"
          stroke="var(--color-primary-400)"
          stroke-width="3"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <path
          d="M58 88 C 51 74 66 67 58 55 C 53 47 59 41 65 39"
          stroke="var(--color-primary-400)"
          stroke-width="2.2"
          stroke-linejoin="round"
          stroke-linecap="round"
          opacity="0.55"
        />
        <circle cx="58" cy="88" r="2.6" fill="var(--color-primary-400)" />
        <circle
          cx="65"
          cy="39"
          r="3.4"
          fill="var(--color-surface-100-900)"
          stroke="var(--color-primary-400)"
          stroke-width="2.4"
        />
      {/if}
    </svg>
  </div>

  <h2 class="text-surface-950-50 text-xl font-bold tracking-tight">{title}</h2>

  {#if body != null}
    <p class="text-surface-600-400 mt-2 max-w-70 text-pretty">{body}</p>
  {/if}

  {#if children != null}
    <div class="es-cta flex w-full max-w-xs flex-col gap-2.5">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .es-fade {
    /* Room for the whole state on a 600px phone, the original page rhythm from ~1070px up. */
    --es-art: clamp(4.5rem, 12svh, 8rem);
    --es-art-gap: clamp(0.875rem, 2.4svh, 1.25rem);
    --es-copy-gap: clamp(1.25rem, 3svh, 1.75rem);

    padding-block: clamp(1.25rem, 4svh, 2.5rem);
  }

  .es-art {
    block-size: var(--es-art);
    inline-size: var(--es-art);
    margin-block-end: var(--es-art-gap);
  }

  .es-cta {
    margin-block-start: var(--es-copy-gap);
  }

  /* ponytail: static dasharray so reduced-motion shows the finished drawing (no draw). */
  .es-draw {
    stroke-dasharray: 320;
  }

  @media (prefers-reduced-motion: no-preference) {
    .es-fade {
      animation: es-fade 320ms ease;
    }

    .es-draw {
      animation: es-draw 1100ms cubic-bezier(0.16, 1, 0.3, 1) both;
    }
  }

  @keyframes es-fade {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes es-draw {
    from {
      stroke-dashoffset: 320;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
