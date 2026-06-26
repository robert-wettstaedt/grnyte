<script lang="ts">
  import { PUBLIC_APPLICATION_NAME as name } from '$env/static/public'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import de from './disclaimer.de.html?raw'
  import en from './disclaimer.en.html?raw'

  // Long-form legal copy lives in the per-locale .html files; {name} is the only token.
  const body = (getLocale() === 'de' ? de : en).replaceAll('{name}', name)
</script>

<svelte:head>
  <title>{m.legal_disclaimer_title()} - {name}</title>
  <meta name="description" content={m.legal_disclaimer_metaDescription({ name })} />
</svelte:head>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted in-repo legal copy -->
{@html body}
