import * as schema from '$lib/db/schema'
import type { Grade } from '$lib/entities/grade/dto'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { remarkDisableLinks } from './remark-disable-links'
import { remarkGrades } from './remark-grades'
import { referenceRegex, remarkReferences, type EncloseOptions } from './remark-references'

export const usernameRegex = /[\da-zA-Z][-\da-zA-Z_]{0,38}/
export const usernameRegexWithAt = /@[\da-zA-Z][-\da-zA-Z_]{0,38}/

export const convertMarkdownToHtml = async (
  markdown: string | null | undefined,
  db?: PostgresJsDatabase<typeof schema>,
  encloseReferences?: EncloseOptions,
): Promise<string> => {
  if (markdown == null) {
    return ''
  }

  const enrichedMarkdown = await enrichMarkdown(markdown, db)

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkReferences, { encloseReferences })
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(enrichedMarkdown)

  if (typeof result.value !== 'string') {
    throw new Error('Failed to convert markdown to html')
  }

  return result.value
}

export const convertMarkdownToHtmlSync = (
  markdown: string | null | undefined,
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

  const result = processor.use(remarkRehype).use(rehypeStringify).processSync(markdown)

  if (typeof result.value !== 'string') {
    throw new Error('Failed to convert markdown to html')
  }

  return result.value
}

const enrichMarkdown = async (markdown: string, db?: PostgresJsDatabase<typeof schema>): Promise<string> => {
  const matchesIterator = markdown.matchAll(new RegExp(referenceRegex, 'gi'))
  const matches = Array.from(matchesIterator ?? []).reverse()

  if (db == null || matches.length === 0) {
    return markdown
  }

  const refs = await Promise.all(
    matches.map(async (match) => {
      const [type, id] = match[0]
        .trim()
        .substring(1, match[0].length - 1)
        .split(':')

      const idNumber = Number(id)

      // `users` has no `name` column — its display name is `username`. The
      // other tables expose `name`, so branch the column selection by type.
      const result =
        type === 'users'
          ? (
              await db.select({ name: schema.users.username }).from(schema.users).where(eq(schema.users.id, idNumber))
            ).at(0)
          : await (async () => {
              const dbSchema = type === 'areas' ? schema.areas : type === 'blocks' ? schema.blocks : schema.routes
              const results = await db.select({ name: dbSchema.name }).from(dbSchema).where(eq(dbSchema.id, idNumber))
              return results.at(0)
            })()

      if (result == null) {
        return null
      }

      let reference = ''
      if (match[0].indexOf('!') > 0) {
        reference += ' '
      }

      reference += `!${type}:${id}:${btoa(result.name)}!`

      return { match, reference }
    }),
  )

  return refs.reduce((str, item) => {
    if (item == null) {
      return str
    }

    const before = str.substring(0, item.match.index)
    const after = str.substring(item.match.index + item.match[0].length)

    return before + item.reference + after
  }, markdown)
}
