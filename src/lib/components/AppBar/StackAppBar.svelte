<script lang="ts">
  import { goto } from '$app/navigation'
  import { getI18n } from '$lib/i18n'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'
  import { resolve } from '$app/paths'

  interface Props {
    backRoute?: string | URL
    children?: Snippet
    title: string
    subtitle?: string
  }

  const { backRoute, children, subtitle, title }: Props = $props()

  const { t } = getI18n()
</script>

<AppBar
  class="preset-filled-surface-100-900 md:border-surface-50-950 fixed top-0 z-10 rounded-b-xl md:right-0 md:left-25 md:w-auto md:border-l-2"
>
  <AppBar.Toolbar class="grid-cols-[auto_1fr_auto]">
    <AppBar.Lead>
      <button
        type="button"
        class="btn-icon"
        onclick={() => (navigation.canGoBack ? navigation.back() : goto(backRoute ?? resolve('/bla')))}
        title={t('common.back')}
      >
        <i class="fa-solid fa-arrow-left"></i>
      </button>
    </AppBar.Lead>

    <AppBar.Headline class="flex-col">
      <span class="leading-none">
        {title}
      </span>

      {#if subtitle}
        <span class="text-surface-500 text-xs leading-none">
          {subtitle}
        </span>
      {/if}
    </AppBar.Headline>

    {#if children != null}
      {@render children?.()}
    {/if}
  </AppBar.Toolbar>
</AppBar>
