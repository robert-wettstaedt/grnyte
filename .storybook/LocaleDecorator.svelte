<script lang="ts">
  import type { Snippet } from 'svelte'
  import { getLocale, locales, setLocale, type Locale } from '../src/lib/paraglide/runtime'

  // German labels run half again as long, which is where this app's layouts break.
  // `reload: false` keeps the switch inside the iframe; a navigation loses Storybook's canvas.
  const { children, locale }: { children: Snippet; locale?: string } = $props()

  $effect(() => {
    const next = locale as Locale | undefined
    if (next != null && locales.includes(next) && next !== getLocale()) {
      setLocale(next, { reload: false })
    }
  })
</script>

{#key locale}
  {@render children()}
{/key}
