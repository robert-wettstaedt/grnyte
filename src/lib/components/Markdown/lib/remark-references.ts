import type { EntityType } from '$lib/components/EntitySearch/search.svelte'
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

/**
 * The other payload that is not a name: the target may well exist, this device just does not have
 * it. Offline no query can ever report itself complete, so "absent from the local replica" and
 * "deleted" are indistinguishable, and saying "not found" about a block somebody is standing under
 * would be worse than saying nothing. Kept apart from {@link REFERENCE_TOMBSTONE} so the two never
 * collapse into one message.
 */
export const REFERENCE_UNAVAILABLE = String.fromCharCode(1)

export type EncloseOptions = 'anchor' | 'strong'

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
      .split(':') as [EntityType, string]

    const idNumber = Number(id)
    if (Number.isNaN(idNumber)) {
      return
    }

    references[type] = [...references[type], idNumber]
  })

  return references
}

export interface MarkdownReference {
  id: number
  /** The target no longer exists — render a tombstone rather than resolving `name`. */
  missing?: boolean
  name: string
  type: EntityType
  /** The target is not in this device's local store, and offline we cannot find out why. */
  unavailable?: boolean
}

export const enrichMarkdownWithReferences = (markdown: string, refs: MarkdownReference[]): string => {
  let enrichedMarkdown = markdown

  refs.forEach(({ id, missing, name, type, unavailable }) => {
    const payload = btoa(unavailable ? REFERENCE_UNAVAILABLE : missing ? REFERENCE_TOMBSTONE : name)
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

/** Localized label for a reference this device cannot resolve while offline. */
const unavailableLabel = (type: string): string =>
  type === 'areas'
    ? m.reference_areaUnavailable()
    : type === 'blocks'
      ? m.reference_blockUnavailable()
      : type === 'routes'
        ? m.reference_routeUnavailable()
        : m.reference_userUnavailable()

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

    // Deleted target, or one this device cannot see right now: inert, muted text either way, and
    // never a link to a page that would render a spinner or a 404.
    if (decoded === REFERENCE_TOMBSTONE || decoded === REFERENCE_UNAVAILABLE) {
      const tombstone: PhrasingContent = {
        children: [
          { type: 'text', value: decoded === REFERENCE_TOMBSTONE ? notFoundLabel(type) : unavailableLabel(type) },
        ],
        data: { hName: 'span', hProperties: { class: 'reference-missing' } },
        type: 'strong',
      }
      return [tombstone]
    }

    const name = decoded ?? `${type}:${id}`

    // Users render as an `@username` mention; the resolved `name` is the username for this type.
    const isUser = type === 'users'

    const strong: PhrasingContent = {
      children: [{ type: 'text', value: isUser ? `@${name}` : name }],
      type: 'strong',
    }

    return [
      encloseReferences === 'strong'
        ? strong
        : {
            children: [strong],
            type: 'link',
            // By id, like every other type, even though a mention READS as a name: `/users/[id]`
            // parses its parameter with `Number()`, so a username landed on a page querying for
            // `NaN` and every mention in the app rendered a link to a 404.
            url: `/${type}/${id}`,
          },
    ]
  }

  return (tree) => {
    findAndReplace(tree, [[new RegExp(referenceRegexWithBase64, 'gi'), replaceReferences]])
  }
}
