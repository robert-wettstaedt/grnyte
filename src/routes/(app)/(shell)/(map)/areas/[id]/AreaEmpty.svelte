<script lang="ts">
  import { resolve } from '$app/paths'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { canAddArea, canAddBlock } from '$lib/entities/area/permissions'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()
  const global = getGlobalState()

  // A null-type area is undetermined: its first child fixes the type — a sub-area
  // makes it an 'area', a block makes it a 'crag'. With edit rights both adds are
  // allowed here, so the empty state is the fork; without them it's just a notice.
  // Per the design a block is the primary path (quickest way to actual routes).
  const canAddAreaHere = $derived(canAddArea(global.userRegions, area))
  const canAddBlockHere = $derived(canAddBlock(global.userRegions, area))
</script>

<div class="ge-fade flex flex-col items-center px-6 py-10 text-center">
  <!-- Bespoke crag illustration (decorative): glow + line-art route with two anchors. -->
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
      <path
        class="ge-draw"
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
    </svg>
  </div>

  {#if canAddBlockHere || canAddAreaHere}
    <h2 class="text-surface-950-50 mb-2 text-xl font-bold tracking-tight">{m.area_empty_title({ name: area.name })}</h2>
    <p class="text-surface-600-400 mb-7 max-w-70 text-pretty">{m.area_empty_body()}</p>

    <div class="flex w-full max-w-xs flex-col gap-3">
      <!-- Block is the primary CTA (filled); sub-area the secondary (outline). -->
      {#if canAddBlockHere}
        <a
          class="btn preset-filled-primary-500 h-13.5 rounded-2xl text-base font-bold shadow-[0_10px_24px_-10px_var(--color-primary-500)]"
          href={resolve('/(app)/areas/[id]/blocks/add', { id: String(area.id) })}
        >
          <Icon name="block" size={20} />
          {m.blocks_addBlock()}
        </a>
      {/if}

      {#if canAddAreaHere}
        <a
          class="btn border-surface-300-700 text-surface-950-50 hover:bg-surface-200-800 h-13.5 rounded-2xl border bg-transparent text-base font-semibold"
          href={resolve('/(app)/areas/[id]/add', { id: String(area.id) })}
        >
          <Icon name="layers" size={20} />
          {m.areas_addSubArea()}
        </a>
      {/if}
    </div>

    {#if canAddBlockHere && canAddAreaHere}
      <p class="text-surface-500 mt-4 max-w-70 text-xs">{m.area_empty_hint()}</p>
    {/if}
  {:else}
    <p class="text-surface-600-400 max-w-xs text-pretty">{m.queryState_empty()}</p>
  {/if}
</div>

<style>
  /* ponytail: static dasharray so reduced-motion shows the full crag (no draw). */
  .ge-draw {
    stroke-dasharray: 240;
  }

  @media (prefers-reduced-motion: no-preference) {
    .ge-fade {
      animation: ge-fade 320ms ease;
    }

    .ge-draw {
      animation: ge-draw 1100ms cubic-bezier(0.16, 1, 0.3, 1) both;
    }
  }

  @keyframes ge-fade {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes ge-draw {
    from {
      stroke-dashoffset: 240;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
