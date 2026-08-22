/**
 * The client half of the markdown pipeline: rendering already-enriched markdown, with no
 * database in reach. Everything that needs a `db` (resolving `!type:id!` tokens against
 * real rows) lives in `./enrich.server`, because pulling that in would drag the whole
 * Drizzle schema into the client bundle. See the header there for the full reasoning.
 */
import type { Grade } from '$lib/entities/grade/dto'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { remarkDisableLinks } from './remark-disable-links'
import { remarkGrades } from './remark-grades'
import { remarkReferences, type EncloseOptions } from './remark-references'
import { remarkSafeUrls } from './remark-safe-urls'

export const convertMarkdownToHtmlSync = (
  markdown: null | string | undefined,
  grades: Grade[],
  encloseReferences?: EncloseOptions,
  disableLinks = false,
): string => {
  if (markdown == null) {
    return ''
  }

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkReferences, { encloseReferences })
    .use(remarkGrades, { grades })

  // Strip the remaining links so the output can live inside an anchor without
  // nesting `<a>` (see `remarkDisableLinks`).
  if (disableLinks) {
    processor.use(remarkDisableLinks)
  }

  // Last of the remark passes, so it also covers whatever the passes above produced.
  const result = processor.use(remarkSafeUrls).use(remarkRehype).use(rehypeStringify).processSync(markdown)

  if (typeof result.value !== 'string') {
    throw new Error('Failed to convert markdown to html')
  }

  return result.value
}
