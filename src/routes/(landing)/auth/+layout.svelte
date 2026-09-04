<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { Snippet } from 'svelte'
  import { legalLinks } from '../legal/links'

  const { children }: { children: Snippet } = $props()
</script>

<div class="bg-surface-50-950 text-surface-950-50 flex min-h-dvh">
  <div class="border-surface-200-800 brand-panel relative hidden flex-1 overflow-clip border-r min-[860px]:block">
    <svg
      viewBox="0 0 700 1000"
      preserveAspectRatio="xMidYMid slice"
      class="pointer-events-none absolute inset-0 h-full w-full opacity-55"
      aria-hidden="true"
    >
      <g fill="none" stroke="var(--color-primary-300-700)" stroke-width="1.4">
        <path d="M-50 820 C 180 740 320 860 540 790 C 720 730 800 810 950 760" />
        <path d="M-50 880 C 200 800 340 920 560 850 C 740 790 820 870 950 820" />
        <path d="M-50 220 C 200 140 380 250 600 180 C 780 120 860 200 950 150" />
        <path d="M-50 150 C 220 70 420 180 640 110 C 820 50 900 130 950 80" />
        <path d="M-50 520 C 240 440 420 560 660 480 C 840 420 900 500 950 460" opacity="0.6" />
      </g>
    </svg>

    <div class="relative flex h-full flex-col justify-between p-12">
      <div class="flex flex-col gap-1.5 self-start">
        <a href={resolve('/')} class="flex items-center gap-2.5">
          <img src={Logo} alt={PUBLIC_APPLICATION_NAME} class="block h-9 w-9 rounded-[9px]" />
          <strong class="[font-family:var(--heading-font-family)] text-[22px] font-bold tracking-tight">
            {PUBLIC_APPLICATION_NAME}
          </strong>
        </a>
        <span class="text-surface-500 text-[13px]">{m.landing_tagline()}</span>
      </div>

      <div class="flex max-w-105 flex-col gap-5">
        <h2 class="text-[34px] leading-[1.12] font-bold tracking-tight text-balance">
          {m.auth_brandHeadline()}
        </h2>
        <p class="text-surface-600-400 text-base leading-relaxed text-pretty">
          {m.auth_brandSubtext()}
        </p>
      </div>

      <div class="text-surface-500 flex items-center gap-2.5 text-[13px]">
        <Icon name="check" size={14} strokeWidth={2.2} />
        {m.auth_openSource()}
      </div>
    </div>
  </div>

  <div class="flex flex-1 flex-col items-center justify-center px-5 py-8">
    <div class="flex w-full max-w-100 flex-col">
      <a href={resolve('/')} class="mb-9 flex items-center gap-2.5 self-center min-[860px]:hidden">
        <img src={Logo} alt={PUBLIC_APPLICATION_NAME} class="block h-8 w-8 rounded-[9px]" />
        <strong class="[font-family:var(--heading-font-family)] text-[21px] font-bold tracking-tight">
          {PUBLIC_APPLICATION_NAME}
        </strong>
      </a>

      {@render children()}
      <a
        href="https://status.grnyte.rocks"
        target="_blank"
        rel="noopener"
        class="text-surface-500 hover:text-surface-950-50 mt-8 self-center text-[13px] no-underline transition-colors"
      >
        {m.landing_footerStatus()}
      </a>

      <!-- Section 5 DDG wants the imprint "leicht erkennbar, unmittelbar erreichbar und ständig
           verfügbar", and these are the pages a signed-out visitor actually lands on. The whole
           legalLinks() row rather than the imprint alone, so this surface cannot drift from the
           others when a page is added. -->
      <nav class="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 self-center">
        {#each legalLinks() as link (link.href)}
          <a
            href={link.href}
            class="text-surface-500 hover:text-surface-950-50 text-[13px] no-underline transition-colors"
          >
            {link.label}
          </a>
        {/each}
      </nav>
    </div>
  </div>
</div>

<style>
  .brand-panel {
    background: linear-gradient(
      160deg,
      light-dark(oklch(0.95 0.03 313), oklch(0.22 0.05 313)) 0%,
      light-dark(oklch(0.975 0.012 305), oklch(0.175 0.015 305)) 48%,
      light-dark(var(--color-surface-50), var(--color-surface-950)) 100%
    );
  }
</style>
