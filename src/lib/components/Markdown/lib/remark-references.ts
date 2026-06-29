import { m } from '$lib/paraglide/messages'
import type { PhrasingContent, Root } from 'mdast'
import { findAndReplace, type ReplaceFunction } from 'mdast-util-find-and-replace'
import { type Plugin } from 'unified'

export const referenceRegex = '!(areas|blocks|routes|users):\\d+!'
const referenceRegexWithBase64 = '!(areas|blocks|routes|users):\\d+:[A-Za-z0-9+/=]+!'

/**
 * Token payload (base64-encoded into a reference) marking a target that no longer exists,
 * so it renders as an inert "… not found" tombstone instead of a link. A null byte can't
 * occur in a real entity name, so it never collides with a resolved reference.
 */
export const REFERENCE_TOMBSTONE = String.fromCharCode(0)

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
  /** The target no longer exists — render a tombstone rather than resolving `name`. */
  missing?: boolean
}

export const enrichMarkdownWithReferences = (markdown: string, refs: MarkdownReference[]): string => {
  let enrichedMarkdown = markdown

  refs.forEach(({ id, name, type, missing }) => {
    const payload = btoa(missing ? REFERENCE_TOMBSTONE : name)
    enrichedMarkdown = enrichedMarkdown.replace(new RegExp(`!${type}:${id}!`, 'g'), `!${type}:${id}:${payload}!`)
  })

  return enrichedMarkdown
}

/** Localized tombstone label for a reference whose target was deleted. */
const notFoundLabel = (type: string): string =>
  type === 'areas'
    ? m.reference_areaNotFound()
    : type === 'blocks'
      ? m.reference_blockNotFound()
      : type === 'routes'
        ? m.reference_routeNotFound()
        : m.reference_userNotFound()

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
    const decoded = base64 == null ? null : atob(base64)

    // Deleted target: inert, muted "… not found" text — never a link to a dead page.
    if (decoded === REFERENCE_TOMBSTONE) {
      const tombstone: PhrasingContent = {
        type: 'strong',
        data: { hName: 'span', hProperties: { class: 'reference-missing' } },
        children: [{ type: 'text', value: notFoundLabel(type) }],
      }
      return [tombstone]
    }

    const name = decoded ?? `${type}:${id}`

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
