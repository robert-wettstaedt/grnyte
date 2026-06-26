<script lang="ts">
  import { resolve } from '$app/paths'
  import Logo from '$lib/assets/logo.svg'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import type { Snippet } from 'svelte'
  import { m } from '$lib/paraglide/messages'

  const { children }: { children: Snippet } = $props()

  const pages = [
    { href: resolve('/legal/privacy'), label: m.legal_layout_001() },
    { href: resolve('/legal/terms'), label: m.legal_layout_002() },
    { href: resolve('/legal/cookies'), label: m.legal_layout_003() },
    { href: resolve('/legal/disclaimer'), label: m.legal_disclaimer_title() },
  ]
</script>

<div class="bg-surface-50-950 text-surface-950-50 flex min-h-dvh flex-col">
  <header class="border-surface-200-800 bg-surface-50-950/80 sticky top-0 z-10 border-b backdrop-blur">
    <div class="mx-auto flex h-15 w-full max-w-3xl items-center justify-between gap-4 px-5">
      <a href={resolve('/')} class="flex items-center gap-2.5">
        <img src={Logo} alt={PUBLIC_APPLICATION_NAME} class="block h-8 w-8 rounded-[9px]" />
        <strong class="[font-family:var(--heading-font-family)] text-lg font-bold tracking-tight">
          {PUBLIC_APPLICATION_NAME}
        </strong>
      </a>
    </div>
  </header>

  <main class="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-14">
    <div class="prose dark:prose-invert max-w-none">
      {@render children()}
    </div>
  </main>

  <footer class="border-surface-200-800 border-t">
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-8">
      <nav class="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {#each pages as p (p.href)}
          <a href={p.href} class="text-surface-600-400 hover:text-surface-950-50 transition-colors">{p.label}</a>
        {/each}
      </nav>
      <p class="text-surface-500 text-xs">
        © {new Date().getFullYear()}
        {PUBLIC_APPLICATION_NAME}. {m.legal_layout_004()}
      </p>
    </div>
  </footer>
</div>
