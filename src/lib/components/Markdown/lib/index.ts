import { config } from '$lib/config'
import * as schema from '$lib/db/schema'
import type { Grade } from '$lib/entities/grade/dto'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkMentions from 'remark-mentions'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified, type Plugin } from 'unified'
import { remarkGrades } from './remark-grades'
import { referenceRegex, remarkReferences, type EncloseOptions } from './remark-references'
import { resolve } from '$app/paths'

export const usernameRegex = /[\da-zA-Z][-\da-zA-Z_]{0,38}/
export const usernameRegexWithAt = /@[\da-zA-Z][-\da-zA-Z_]{0,38}/

// `remark-mentions` bundles its own copy of `unified`, whose `Processor` `this`
// type is structurally incompatible with the one the app resolves. Re-type the
// plugin against our `unified` so `.use()` accepts it.
const mentions = remarkMentions as unknown as Plugin<[{ usernameLink: (username: string) => string }]>

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
    .use(mentions, {
      usernameLink: (username) => resolve(`/users/${username}`),
    })
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
): string => {
  if (markdown == null) {
    return ''
  }

  const result = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(mentions, {
      usernameLink: (username) => resolve(`/users/${username}`),
    })
    .use(remarkReferences, { encloseReferences })
    .use(remarkGrades, { grades })
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(markdown)

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

      const dbSchema = type === 'areas' ? schema.areas : type === 'blocks' ? schema.blocks : schema.routes
      const results = await db.select({ name: dbSchema.name }).from(dbSchema).where(eq(dbSchema.id, idNumber))
      const result = results.at(0)

      if (result == null) {
        return null
      }

      let reference = ''
      if (match[0].indexOf('!') > 0) {
        reference += ' '
      }

      const name = result.name.length === 0 ? config.routes.defaultName : result.name
      reference += `!${type}:${id}:${btoa(name)}!`

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

export const replaceMention = (markdown: string | null | undefined, oldUsername: string, newUsername: string) => {
  const matchesIterator = markdown?.matchAll(new RegExp(usernameRegexWithAt, 'gi'))
  const matches = Array.from(matchesIterator ?? []).toReversed()

  return matches
    .reduce((desc, match) => {
      if (match[0] === `@${oldUsername}`) {
        return desc?.toSpliced(match.index, oldUsername.length + 1, `@${newUsername}`)
      }

      return desc
    }, markdown?.split(''))
    ?.join('')
}
