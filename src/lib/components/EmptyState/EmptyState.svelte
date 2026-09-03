<script lang="ts" module>
  /** The CTA geometry this family shares: filled for the action we want taken, outlined for the
   *  alternative. Exported so the callers cannot drift apart. */
  export const EMPTY_CTA_PRIMARY =
    'btn preset-filled-primary-500 h-13.5 rounded-2xl text-base font-bold shadow-[0_10px_24px_-10px_var(--color-primary-500)]'
  export const EMPTY_CTA_SECONDARY =
    'btn border-surface-300-700 text-surface-950-50 hover:bg-surface-200-800 h-13.5 rounded-2xl border bg-transparent text-base font-semibold'
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
   */
  interface Props {
    body: string
    /** The calls to action. First one filled, any second one outlined, see the callers. */
    children?: Snippet
    /** Tie-breaker under the buttons, for when the CTAs are a genuine fork. */
    hint?: string
    motif: 'crag' | 'region' | 'routes'
    title: string
  }

  const { body, children, hint, motif, title }: Props = $props()
</script>

<div class="es-fade flex flex-col items-center px-6 py-10 text-center">
  <!-- Decorative: the heading below carries the meaning. -->
  <div class="relative mb-5 size-32">
    <div
      class="absolute inset-0 rounded-full"
      style="background:radial-gradient(circle at 50% 40%, color-mix(in oklab, var(--color-primary-500) 22%, transparent), transparent 68%)"
    ></div>

    <svg class="relative" width="128" height="128" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle
        cx="60"
        cy="60"
        r="46"
        stroke="var(--color-surface-400)"
        stroke-width="1.5"
        stroke-dasharray="3 6"
        opacity="0.5"
      />

      {#if motif === 'crag'}
        <!-- A crag skyline with two anchors: what an area is waiting to be filled with. -->
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
        <!-- A region boundary drawn around one small crag: the container, and the first thing
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

  <h2 class="text-surface-950-50 mb-2 text-xl font-bold tracking-tight">{title}</h2>
  <p class="text-surface-600-400 mb-7 max-w-70 text-pretty">{body}</p>

  {#if children != null}
    <div class="flex w-full max-w-xs flex-col gap-3">
      {@render children()}
    </div>
  {/if}

  {#if hint != null}
    <p class="text-surface-500 mt-4 max-w-70 text-xs">{hint}</p>
  {/if}
</div>

<style>
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
