/** One piece of a rendered credit: plain text, or a link when `href` is set. */
export interface CreditPart {
  href?: string
  text: string
}

/**
 * Region credits are stored as HTML and the links in them are required by the licence, but the
 * string is region-admin input: parsed here and re-emitted as text and anchors only, never
 * `{@html}`.
 */
export function parseCredit(html: string): CreditPart[] {
  const parts: CreditPart[] = []
  collect(new DOMParser().parseFromString(html, 'text/html').body, parts)
  return parts
}

/** Elements whose text is code rather than something to read. */
// `DESC` and `TITLE` are SVG's tooltip and a11y text, which is not a credit either.
const NON_PROSE = new Set(['DESC', 'METADATA', 'NOSCRIPT', 'SCRIPT', 'STYLE', 'TEMPLATE', 'TITLE'])

/** Depth-first: a pasted credit routinely wraps its link in a `<span>`, and a link one level
 *  down is still the link the licence wants. Comments carry no credit and are skipped. */
function collect(parent: Node, parts: CreditPart[]): void {
  for (const node of parent.childNodes) {
    if (!isProse(node)) {
      continue
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text !== '') {
        parts.push({ text })
      }
      continue
    }

    const element = node as Element
    if (element.tagName.toUpperCase() !== 'A') {
      collect(element, parts)
      continue
    }

    const href = safeHref(element)
    // A logo-only credit has no text of its own, and the host beats dropping the link.
    const label = proseText(element).trim()
    const text = label !== '' ? label : href == null ? '' : hostOf(href)
    if (text !== '') {
      parts.push(href == null ? { text } : { href, text })
    }
  }
}

/** Only ever called with a `safeHref` result, which `new URL` has already accepted. */
function hostOf(href: string): string {
  return new URL(href).host
}

/**
 * Whether a node carries something to read: a text node, or an element that is not code. By tag
 * name rather than by instance, since SVG and MathML keep their case and an anchor inside `<svg>`
 * is an SVGAElement.
 */
function isProse(node: ChildNode): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return true
  }
  return node.nodeType === Node.ELEMENT_NODE && !NON_PROSE.has((node as Element).tagName.toUpperCase())
}

/** An anchor's label, minus the parts `textContent` would sweep in with it. */
function proseText(element: Element): string {
  let text = ''
  for (const node of element.childNodes) {
    if (!isProse(node)) {
      continue
    }
    text += node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : proseText(node as Element)
  }
  return text
}

/** Absolute http(s) only. The resolved `href` property would turn a bare `<a>` into a link back
 *  into grnyte, presented as somebody's attribution. `xlink:href` is SVG's legacy spelling. */
function safeHref(anchor: Element): string | undefined {
  // `getAttribute` gives '' rather than null for `href=""`, so `??` would never reach the xlink
  // spelling. That prefix only binds inside `<svg>`, where the parser adjusts foreign attributes.
  const direct = anchor.getAttribute('href')
  const raw =
    direct == null || direct.trim() === '' ? anchor.getAttributeNS('http://www.w3.org/1999/xlink', 'href') : direct
  if (raw == null || raw.trim() === '') {
    return undefined
  }

  try {
    // A fixed https base, so a protocol-relative `//host/path` resolves while a genuinely
    // relative href still fails: it would resolve against this base, not the credit's own host.
    const url = new URL(raw, 'https://invalid.localhost/')
    if (url.hostname === 'invalid.localhost') {
      return undefined
    }
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}
