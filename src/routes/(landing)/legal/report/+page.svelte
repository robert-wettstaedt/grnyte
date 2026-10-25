<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME as name, PUBLIC_REPORT_EMAIL } from '$env/static/public'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { renderLegal } from '../links'
  import { reportMailto } from './mailto'
  import de from './report.de.html?raw'
  import en from './report.en.html?raw'

  // Long-form legal copy lives in the per-locale .html files. `renderLegal` fills every token in it,
  // including the cross-page links, which go through `resolve()` so a moved route breaks the build.
  const body = $derived(
    renderLegal(getLocale() === 'de' ? de : en, {
      reportMailto: reportMailto(PUBLIC_REPORT_EMAIL, page.url.searchParams.get('content'), page.url.origin),
    }),
  )
</script>

<svelte:head>
  <title>{m.legal_report_title()} - {name}</title>
  <meta name="description" content={m.legal_report_metaDescription({ name })} />
</svelte:head>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted in-repo legal copy -->
{@html body}
