import type { EntityItem, EntityType } from '$lib/components/EntitySearch/search.svelte'
import type { JSONContent, MarkdownToken } from '@tiptap/core'
import Mention, { type MentionOptions } from '@tiptap/extension-mention'
import type { DOMOutputSpec, Node as PMNode } from '@tiptap/pm/model'
import type { SuggestionOptions } from '@tiptap/suggestion'

/** Node name, also used as the markdown token name for the unified `@` reference. */
export const REFERENCE_NODE_NAME = 'reference'

/** The shape the node stores in its attributes (`id` is a string, like Mention). */
interface ReferenceAttrs {
  id: string
  label: string
  type: EntityType
}

const REF_TYPES = 'areas|blocks|routes|users'
// `start` scans for the next possible token; the anchored form parses one at the cursor.
const REF_FIND = new RegExp(`!(?:${REF_TYPES}):\\d+!`)
const REF_ANCHORED = new RegExp(`^!(${REF_TYPES}):(\\d+)!`)

const attrsOf = (node: JSONContent | PMNode): ReferenceAttrs => {
  const attrs = (node.attrs ?? {}) as Partial<ReferenceAttrs>
  return { id: attrs.id ?? '', label: attrs.label ?? '', type: attrs.type as EntityType }
}

export interface ReferenceExtensionOptions {
  /**
   * Best-effort, synchronous label lookup used when rehydrating stored
   * `!type:id!` tokens into chips on load. Returns `undefined` when the entity
   * isn't loaded yet — the chip still round-trips to markdown via type + id.
   */
  resolveLabel: (type: EntityType, id: string) => string | undefined
  /** Suggestion config (trigger, items, command, render) supplied by the editor. */
  suggestion: Omit<SuggestionOptions<EntityItem, EntityItem>, 'editor'>
}

/**
 * A typed `@` reference built on `@tiptap/extension-mention`. Unlike Mention's
 * own `@[label](id)` markdown spec, this serializes to the app's portable
 * `!type:id!` token (so renames stay safe) and rehydrates it back into a chip.
 * The picker covers People · Areas · Blocks · Routes — all four serialize the
 * same way; the render pipeline resolves each id to its current name.
 */
export const createReferenceExtension = ({ resolveLabel, suggestion }: ReferenceExtensionOptions) =>
  Mention.extend({
    addAttributes() {
      return {
        ...(this.parent?.() ?? {}),
        type: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-ref-type'),
          renderHTML: (attributes) => (attributes.type ? { 'data-ref-type': attributes.type } : {}),
        },
      }
    },

    markdownTokenizer: {
      level: 'inline',
      name: REFERENCE_NODE_NAME,
      start: (src) => src.match(REF_FIND)?.index ?? -1,
      tokenize: (src) => {
        const match = REF_ANCHORED.exec(src)
        if (match == null) {
          return undefined
        }
        return { raw: match[0], refId: match[2], refType: match[1], type: REFERENCE_NODE_NAME }
      },
    },

    markdownTokenName: REFERENCE_NODE_NAME,
    name: REFERENCE_NODE_NAME,
    parseMarkdown: (token: MarkdownToken): JSONContent => {
      const type = token.refType as EntityType
      const id = String(token.refId)
      return { attrs: { id, label: resolveLabel(type, id) ?? '', type }, type: REFERENCE_NODE_NAME }
    },
    renderMarkdown: (node: JSONContent): string => {
      const { id, type } = attrsOf(node)
      return `!${type}:${id}!`
    },
  }).configure({
    // Self-contained typed chip: carries every attribute so `getHTML`/`parseHTML`
    // round-trip without relying on the merged HTMLAttributes.
    renderHTML: ({ node }): DOMOutputSpec => {
      const { id, label, type } = attrsOf(node)
      const prefix = type === 'users' ? '@' : ''
      return [
        'span',
        {
          class: `reference-chip reference-chip-${type}`,
          'data-id': id,
          'data-label': label,
          'data-ref-type': type,
          'data-type': REFERENCE_NODE_NAME,
        },
        `${prefix}${label}`,
      ]
    },
    renderText: ({ node }) => {
      const { label, type } = attrsOf(node)
      return `${type === 'users' ? '@' : ''}${label}`
    },
    suggestion: suggestion as unknown as MentionOptions['suggestion'],
  })
