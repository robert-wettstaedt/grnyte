import type { Root, Strong } from 'mdast'
import { type Plugin } from 'unified'
import { visit } from 'unist-util-visit'

// Rewrites every link — mentions, autolinks and inline `[text](url)` — into a
// non-interactive `strong`, leaving the rendered HTML free of `<a>`. Needed when
// a markdown preview is nested inside an anchor (e.g. a clickable list item),
// where `<a>`-in-`<a>` is invalid. References already render as `strong` via
// `encloseReferences`; this applies the same treatment to the link types the
// pipeline can't otherwise suppress.
export const remarkDisableLinks: Plugin<[], Root> = () => (tree) => {
  visit(tree, (node, index, parent) => {
    if (parent == null || index == null) {
      return
    }

    if (node.type === 'link' || node.type === 'linkReference') {
      const strong: Strong = { type: 'strong', children: node.children }
      parent.children[index] = strong as (typeof parent.children)[number]
    }
  })
}
