<script lang="ts">
  import { PUBLIC_APPLICATION_NAME as name } from '$env/static/public'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { renderLegal } from '../links'
  import de from './report.de.html?raw'
  import en from './report.en.html?raw'

  // Long-form legal copy lives in the per-locale .html files. `renderLegal` fills every token in it,
  // including the cross-page links, which go through `resolve()` so a moved route breaks the build.
  const body = renderLegal(getLocale() === 'de' ? de : en)
</script>

<svelte:head>
  <title>{m.legal_report_title()} - {name}</title>
  <meta name="description" content={m.legal_report_metaDescription({ name })} />
</svelte:head>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted in-repo legal copy -->
{@html body}
