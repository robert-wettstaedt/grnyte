import { config } from '$lib/config'
import * as schema from '$lib/db/schema'
import type { Row } from '$lib/db/zero'
import { getGradeColor } from '$lib/grades'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { PhrasingContent, Root } from 'mdast'
import { findAndReplace, type FindAndReplaceList, type ReplaceFunction } from 'mdast-util-find-and-replace'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkMentions from 'remark-mentions'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified, type Plugin } from 'unified'

export const usernameRegex = /[\da-zA-Z][-\da-zA-Z_]{0,38}/
export const usernameRegexWithAt = /@[\da-zA-Z][-\da-zA-Z_]{0,38}/

export type EncloseOptions = 'anchor' | 'strong'

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
    .use(remarkMentions, {
      usernameLink: (username) => `/users/${username}`,
    })
    .use(remarkReferences, { encloseReferences })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(enrichedMarkdown)

  if (typeof result.value !== 'string') {
    throw new Error('Failed to convert markdown to html')
  }

  return result.value
}

export const convertMarkdownToHtmlSync = (
  markdown: string | null | undefined,
  grades: Row<'grades'>[],
  encloseReferences?: EncloseOptions,
): string => {
  if (markdown == null) {
    return ''
  }

  const result = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMentions, {
      usernameLink: (username) => `/users/${username}`,
    })
    .use(remarkReferences, { encloseReferences })
    .use(remarkGrades, { grades })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .processSync(markdown)

  if (typeof result.value !== 'string') {
    throw new Error('Failed to convert markdown to html')
  }

  return result.value
}

export const referenceRegex = '!(areas|blocks|routes):\\d+!'
export const referenceRegexWithBase64 = '!(areas|blocks|routes):\\d+:[A-Za-z0-9+/=]+!'

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeGrade = (value: string): string => value.replaceAll(/\s+/g, '').toLowerCase()

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

interface RemarkGradesOptions {
  grades?: Row<'grades'>[]
}

const remarkGrades: Plugin<[RemarkGradesOptions?], Root> = ({ grades } = {}) => {
  const replace: ReplaceFunction = (value) => {
    if (typeof value !== 'string') {
      return []
    }

    const normalized = normalizeGrade(value)
    const gradeFB = grades?.findLast((grade) =>
      grade.FB == null ? false : normalizeGrade(grade.FB).includes(normalized),
    )
    const gradeV = grades?.findLast((grade) => (grade.V == null ? false : normalizeGrade(grade.V).includes(normalized)))

    const label = gradeFB?.FB ?? gradeV?.V ?? value
    const grade = gradeFB ?? gradeV
    const background = grade == null ? null : getGradeColor(grade)

    const badge: PhrasingContent = {
      type: 'strong',
      children: [{ type: 'text', value: label }],
      data: {
        hName: 'div',
        hProperties: {
          className: ['badge', 'font-semibold', 'text-white'],
          ...(background == null ? {} : { style: `background: ${background}` }),
        },
      },
    }

    return [badge]
  }

  return (tree) => {
    const isBadge = (node: unknown): boolean => {
      const maybeNode = node as {
        data?: { hName?: unknown; hProperties?: { className?: unknown } }
      }

      if (maybeNode?.data?.hName !== 'div') {
        return false
      }

      const className = maybeNode.data?.hProperties?.className
      return Array.isArray(className) ? className.includes('badge') : className === 'badge'
    }

    const replacements = (grades ?? []).toReversed().flatMap((grade) => {
      const arr: FindAndReplaceList = []

      if (grade.FB != null) {
        const fb = grade.FB
        const fbNoSpaces = fb.replaceAll(/\s/g, '')
        const fbSecondToken = fb.split(/\s+/).at(1)
        arr.push([new RegExp(escapeRegExp(fb), 'gi'), replace], [new RegExp(escapeRegExp(fbNoSpaces), 'gi'), replace])

        if (fbSecondToken != null && fbSecondToken.length > 0) {
          arr.push([new RegExp(escapeRegExp(fbSecondToken), 'gi'), replace])
        }
      }

      if (grade.V != null) {
        arr.push([new RegExp(escapeRegExp(grade.V), 'gi'), replace])
      }

      return arr
    })

    findAndReplace(tree, replacements, { ignore: isBadge })
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

export interface MarkdownReferencesIds {
  areas: number[]
  blocks: number[]
  routes: number[]
}

export const getReferences = (markdown: string): MarkdownReferencesIds => {
  const matchesIterator = markdown.matchAll(new RegExp(referenceRegex, 'gi'))
  const matches = Array.from(matchesIterator ?? []).reverse()

  const references: MarkdownReferencesIds = { areas: [], blocks: [], routes: [] }

  matches.forEach((match) => {
    const [type, id] = match[0]
      .trim()
      .substring(1, match[0].length - 1)
      .split(':') as ['areas' | 'blocks' | 'routes', string]

    const idNumber = Number(id)
    if (Number.isNaN(idNumber)) {
      return
    }

    references[type] = [...references[type], idNumber]
  })

  return references
}

export interface MarkdownReference {
  type: 'areas' | 'blocks' | 'routes'
  id: number
  name: string
}

export const enrichMarkdownWithReferences = (markdown: string, refs: MarkdownReference[]): string => {
  let enrichedMarkdown = markdown

  refs.forEach(({ id, name, type }) => {
    const formattedName = name.length === 0 ? config.routes.defaultName : name

    enrichedMarkdown = enrichedMarkdown.replace(
      new RegExp(`!${type}:${id}!`, 'g'),
      `!${type}:${id}:${btoa(formattedName)}!`,
    )
  })

  return enrichedMarkdown
}
