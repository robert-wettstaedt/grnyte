import type { ReferenceType } from '$lib/components/Markdown/lib/remark-references'
import type { JSONContent, MarkdownToken } from '@tiptap/core'
import Mention, { type MentionOptions } from '@tiptap/extension-mention'
import type { DOMOutputSpec, Node as PMNode } from '@tiptap/pm/model'
import type { SuggestionOptions } from '@tiptap/suggestion'

/** Node name, also used as the markdown token name for the unified `@` reference. */
export const REFERENCE_NODE_NAME = 'reference'

/** A reference candidate surfaced by the picker and inserted as a chip. */
export interface ReferenceItem {
  type: ReferenceType
  id: number
  label: string
}

/** The shape the node stores in its attributes (`id` is a string, like Mention). */
interface ReferenceAttrs {
  type: ReferenceType
  id: string
  label: string
}

const REF_TYPES = 'areas|blocks|routes|users'
// `start` scans for the next possible token; the anchored form parses one at the cursor.
const REF_FIND = new RegExp(`!(?:${REF_TYPES}):\\d+!`)
const REF_ANCHORED = new RegExp(`^!(${REF_TYPES}):(\\d+)!`)

const attrsOf = (node: PMNode | JSONContent): ReferenceAttrs => {
  const attrs = (node.attrs ?? {}) as Partial<ReferenceAttrs>
  return { type: attrs.type as ReferenceType, id: attrs.id ?? '', label: attrs.label ?? '' }
}

export interface ReferenceExtensionOptions {
  /** Suggestion config (trigger, items, command, render) supplied by the editor. */
  suggestion: Omit<SuggestionOptions<ReferenceItem, ReferenceItem>, 'editor'>
  /**
   * Best-effort, synchronous label lookup used when rehydrating stored
   * `!type:id!` tokens into chips on load. Returns `undefined` when the entity
   * isn't loaded yet — the chip still round-trips to markdown via type + id.
   */
  resolveLabel: (type: ReferenceType, id: string) => string | undefined
}

/**
 * A typed `@` reference built on `@tiptap/extension-mention`. Unlike Mention's
 * own `@[label](id)` markdown spec, this serializes to the app's portable
 * `!type:id!` token (so renames stay safe) and rehydrates it back into a chip.
 * The picker covers People · Areas · Blocks · Routes — all four serialize the
 * same way; the render pipeline resolves each id to its current name.
 */
export const createReferenceExtension = ({ suggestion, resolveLabel }: ReferenceExtensionOptions) =>
  Mention.extend({
    name: REFERENCE_NODE_NAME,

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

    // --- Markdown round-trip: the portable `!type:id!` token ---
    markdownTokenName: REFERENCE_NODE_NAME,
    markdownTokenizer: {
      name: REFERENCE_NODE_NAME,
      level: 'inline',
      start: (src) => src.match(REF_FIND)?.index ?? -1,
      tokenize: (src) => {
        const match = REF_ANCHORED.exec(src)
        if (match == null) {
          return undefined
        }
        return { type: REFERENCE_NODE_NAME, raw: match[0], refType: match[1], refId: match[2] }
      },
    },
    parseMarkdown: (token: MarkdownToken): JSONContent => {
      const type = token.refType as ReferenceType
      const id = String(token.refId)
      return { type: REFERENCE_NODE_NAME, attrs: { type, id, label: resolveLabel(type, id) ?? '' } }
    },
    renderMarkdown: (node: JSONContent): string => {
      const { type, id } = attrsOf(node)
      return `!${type}:${id}!`
    },
  }).configure({
    suggestion: suggestion as unknown as MentionOptions['suggestion'],
    // Self-contained typed chip: carries every attribute so `getHTML`/`parseHTML`
    // round-trip without relying on the merged HTMLAttributes.
    renderHTML: ({ node }): DOMOutputSpec => {
      const { type, id, label } = attrsOf(node)
      const prefix = type === 'users' ? '@' : ''
      return [
        'span',
        {
          'data-type': REFERENCE_NODE_NAME,
          'data-ref-type': type,
          'data-id': id,
          'data-label': label,
          class: `reference-chip reference-chip-${type}`,
        },
        `${prefix}${label}`,
      ]
    },
    renderText: ({ node }) => {
      const { type, label } = attrsOf(node)
      return `${type === 'users' ? '@' : ''}${label}`
    },
  })
