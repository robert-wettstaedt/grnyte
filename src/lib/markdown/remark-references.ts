import { config } from '$lib/config'
import type { PhrasingContent, Root } from 'mdast'
import { findAndReplace, type ReplaceFunction } from 'mdast-util-find-and-replace'
import { type Plugin } from 'unified'

export const referenceRegex = '!(areas|blocks|routes):\\d+!'
const referenceRegexWithBase64 = '!(areas|blocks|routes):\\d+:[A-Za-z0-9+/=]+!'

export type EncloseOptions = 'anchor' | 'strong'

interface MarkdownReferencesIds {
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
