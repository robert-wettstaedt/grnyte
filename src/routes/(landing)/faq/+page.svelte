<script lang="ts">
  import { PUBLIC_APPLICATION_NAME as name, PUBLIC_REPORT_EMAIL as reportEmail } from '$env/static/public'
  import ProsePage from '$lib/components/ProsePage/ProsePage.svelte'
  import { DEFAULT_MAX_MEMBERS, MAX_OWNED_REGIONS } from '$lib/entities/region/dto'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { legalLinks } from '../legal/links'
  import de from './faq.de.html?raw'
  import en from './faq.en.html?raw'

  // Long-form copy lives in the per-locale .html files, same as the legal pages. The two caps are
  // tokens rather than literals so the answers cannot drift from the code that enforces them: an
  // FAQ that publishes the wrong number is a public lie, not a typo.
  const body = (getLocale() === 'de' ? de : en)
    .replaceAll('{name}', name)
    .replaceAll('{maxMembers}', String(DEFAULT_MAX_MEMBERS))
    .replaceAll('{maxRegions}', String(MAX_OWNED_REGIONS))
    .replaceAll('{reportEmail}', reportEmail)

  /** Anchor id for a question, stable enough to share and readable in the address bar. */
  function slug(text: string): string {
    return text
      .replaceAll('ä', 'ae')
      .replaceAll('ö', 'oe')
      .replaceAll('ü', 'ue')
      .replaceAll('ß', 'ss')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  // The overview is derived from the answers rather than maintained beside them, so a question
  // added or reworded in the .html files updates both at once and neither locale can drift.
  // `scroll-mt-20` clears ProsePage's sticky header, which a jump target lands underneath otherwise.
  const questions: { id: string; label: string }[] = []
  const withAnchors = body.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/g, (_match, attrs: string, inner: string) => {
    const label = inner
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const id = slug(label)
    questions.push({ id, label })
    return `<h2 id="${id}" class="scroll-mt-20"${attrs}>${inner}</h2>`
  })

  // Everything ahead of the first question (the h1, plus the draft banner while it is still there)
  // belongs above the overview.
  const firstQuestion = withAnchors.indexOf('<h2')
  const intro = withAnchors.slice(0, firstQuestion)
  const answers = withAnchors.slice(firstQuestion)
</script>

<svelte:head>
  <title>{m.faq_title()} - {name}</title>
  <meta name="description" content={m.faq_metaDescription({ name })} />
</svelte:head>

<ProsePage links={legalLinks()}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted in-repo copy -->
  {@html intro}

  <nav aria-labelledby="faq-overview">
    <h2 id="faq-overview" class="scroll-mt-20">{m.faq_overview()}</h2>

    <ul class="list-none pl-0">
      {#each questions as question (question.id)}
        <li class="my-0 break-inside-avoid py-1">
          <a class="anchor" href="#{question.id}">{question.label}</a>
        </li>
      {/each}
    </ul>
  </nav>

  <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted in-repo copy -->
  {@html answers}
</ProsePage>
