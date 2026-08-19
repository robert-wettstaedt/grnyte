import type { Root, Strong } from 'mdast'
import { type Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * What a link or an image in a body of text is allowed to point at.
 *
 * CommonMark keeps whatever URL was written, so `[tap here](javascript:...)` survives the parse
 * and `rehype-stringify` emits it as a real `href`, which `{@html}` then hands to the browser.
 * Every body of text in the app is written by somebody and read by somebody else, and a comment
 * needs nothing but region membership to write, so the lowest tier could otherwise run script in
 * the app's own origin on every reader who taps.
 *
 * An allowlist rather than a `javascript:` blocklist: `data:`, `vbscript:` and a whitespace- or
 * entity-obfuscated spelling of any of them all end at the same place, and the set of things a
 * climbing note legitimately links to is four schemes long.
 *
 * `rehype-sanitize` would do this too, and a great deal else, but the pipeline emits no raw HTML
 * (there is no `rehype-raw` on it), so the URL is the only thing left to sanitize.
 */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * Whether a URL is one of those, with a relative one counting as safe.
 *
 * Parsed rather than pattern-matched, because the parser is what the browser will use: it is the
 * only thing that agrees with the browser about `java\nscript:` and `JAVASCRIPT:`. A URL that does
 * not parse against a base is not a URL, so it is refused rather than guessed at.
 */
function isSafeUrl(url: string): boolean {
  // A fragment or a site-relative path resolves against the app's own origin, which is safe by
  // construction. `URL` needs a base for those, and any base answers the protocol question.
  try {
    return SAFE_PROTOCOLS.has(new URL(url, 'https://grnyte.invalid').protocol)
  } catch {
    return false
  }
}

/**
 * Strip the interactivity out of a link the browser must not follow, and drop an unsafe image.
 *
 * A refused link becomes `strong`, exactly as `remarkDisableLinks` renders one, so the words
 * somebody wrote still read as they wrote them: the text of a link is content, the target is not.
 */
export const remarkSafeUrls: Plugin<[], Root> = () => (tree) => {
  visit(tree, (node, index, parent) => {
    if (parent == null || index == null) {
      return
    }

    if (node.type === 'link' && !isSafeUrl(node.url)) {
      const strong: Strong = { children: node.children, type: 'strong' }
      parent.children[index] = strong as (typeof parent.children)[number]
      return
    }

    if (node.type === 'image' && !isSafeUrl(node.url)) {
      parent.children[index] = { type: 'text', value: node.alt ?? '' } as (typeof parent.children)[number]
    }
  })
}
