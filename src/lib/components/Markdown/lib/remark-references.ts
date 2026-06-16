import type { PhrasingContent, Root } from 'mdast'
import { findAndReplace, type ReplaceFunction } from 'mdast-util-find-and-replace'
import { type Plugin } from 'unified'

export const referenceRegex = '!(areas|blocks|routes|users):\\d+!'
const referenceRegexWithBase64 = '!(areas|blocks|routes|users):\\d+:[A-Za-z0-9+/=]+!'

export type EncloseOptions = 'anchor' | 'strong'

export type ReferenceType = 'areas' | 'blocks' | 'routes' | 'users'

export interface MarkdownReferencesIds {
  areas: number[]
  blocks: number[]
  routes: number[]
  users: number[]
}

export const getReferences = (markdown: string): MarkdownReferencesIds => {
  const matchesIterator = markdown.matchAll(new RegExp(referenceRegex, 'gi'))
  const matches = Array.from(matchesIterator ?? []).reverse()

  const references: MarkdownReferencesIds = { areas: [], blocks: [], routes: [], users: [] }

  matches.forEach((match) => {
    const [type, id] = match[0]
      .trim()
      .substring(1, match[0].length - 1)
      .split(':') as [ReferenceType, string]

    const idNumber = Number(id)
    if (Number.isNaN(idNumber)) {
      return
    }

    references[type] = [...references[type], idNumber]
  })

  return references
}

export interface MarkdownReference {
  type: ReferenceType
  id: number
  name: string
}

export const enrichMarkdownWithReferences = (markdown: string, refs: MarkdownReference[]): string => {
  let enrichedMarkdown = markdown

  refs.forEach(({ id, name, type }) => {
    enrichedMarkdown = enrichedMarkdown.replace(new RegExp(`!${type}:${id}!`, 'g'), `!${type}:${id}:${btoa(name)}!`)
  })

  return enrichedMarkdown
}

interface RemarkReferencesOptions {
  encloseReferences?: EncloseOptions
}

export const remarkReferences: Plugin<[RemarkReferencesOptions?], Root> = ({ encloseReferences = 'anchor' } = {}) => {
  const replaceReferences: ReplaceFunction = (value) => {
    if (typeof value !== 'string') {
      return []
    }

    const [type, id, base64] = value
      .trim()
      .substring(1, value.length - 1)
      .split(':')
    const name = base64 == null ? `${type}:${id}` : atob(base64)

    // Users render as an `@username` mention (replacing the retired
    // `remark-mentions`); the resolved `name` is the username for this type.
    const isUser = type === 'users'

    const strong: PhrasingContent = {
      type: 'strong',
      children: [{ type: 'text', value: isUser ? `@${name}` : name }],
    }

    return [
      encloseReferences === 'strong'
        ? strong
        : {
            type: 'link',
            url: isUser ? `/users/${name}` : `/${type}/${id}`,
            children: [strong],
          },
    ]
  }

  return (tree) => {
    findAndReplace(tree, [[new RegExp(referenceRegexWithBase64, 'gi'), replaceReferences]])
  }
}
