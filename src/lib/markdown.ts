import { config } from '$lib/config'
import * as schema from '$lib/db/schema'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { PhrasingContent, Root } from 'mdast'
import { findAndReplace, type ReplaceFunction } from 'mdast-util-find-and-replace'
import remarkHtml from 'remark-html'
import remarkMentions from 'remark-mentions'
import remarkParse from 'remark-parse'
import { unified, type Plugin } from 'unified'

export const usernameRegex = /[\da-zA-Z][-\da-zA-Z_]{0,38}/
export const usernameRegexWithAt = /@[\da-zA-Z][-\da-zA-Z_]{0,38}/

type EncloseOptions = 'anchor' | 'strong'

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
    .use(remarkMentions, {
      usernameLink: (username) => `/users/${username}`,
    })
    .use(remarkReferences, { encloseReferences })
    .use(remarkHtml)
    .process(enrichedMarkdown)

  if (typeof result.value !== 'string') {
    throw new Error('Failed to convert markdown to html')
  }

  return result.value
}

export const referenceRegex = '!(areas|blocks|routes):\\d+!'
export const referenceRegexWithBase64 = '!(areas|blocks|routes):\\d+:[A-Za-z0-9+/=]+!'

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

interface RemarkReferencesOptions {
  encloseReferences?: EncloseOptions
}

const remarkReferences: Plugin<[RemarkReferencesOptions?], Root> = ({ encloseReferences = 'anchor' } = {}) => {
  const replaceReferences: ReplaceFunction = (value) => {
    if (typeof value !== 'string') {
      return []
    }

    const [type, id, base64] = value
      .trim()
      .substring(1, value.length - 1)
      .split(':')
    const name = base64 == null ? `${type}:${id}` : atob(base64)

    const strong: PhrasingContent = {
      type: 'strong',
      children: [{ type: 'text', value: name }],
    }

    return [
      encloseReferences === 'strong'
        ? strong
        : {
            type: 'link',
            url: `/${type}/${id}`,
            children: [strong],
          },
    ]
  }

  return (tree) => {
    findAndReplace(tree, [[new RegExp(referenceRegexWithBase64, 'gi'), replaceReferences]])
  }
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
