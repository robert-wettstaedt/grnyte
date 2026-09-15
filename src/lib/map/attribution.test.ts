import { describe, expect, it } from 'vitest'
import { parseCredit } from './attribution'

describe('parseCredit', () => {
  // The shape actually stored in `regions.settings.mapLayers[].attributions`, which is what
  // OpenLayers' attribution control used to consume.
  it('keeps the link in a real region credit', () => {
    expect(
      parseCredit('© <a href="https://geodaten.bayern.de/" target="_blank">Bayerische Vermessungsverwaltung</a>'),
    ).toEqual([{ text: '© ' }, { href: 'https://geodaten.bayern.de/', text: 'Bayerische Vermessungsverwaltung' }])
  })

  it('passes plain text through untouched', () => {
    expect(parseCredit('Data: Survey Office')).toEqual([{ text: 'Data: Survey Office' }])
  })

  it('handles several links in one credit', () => {
    const parts = parseCredit('<a href="https://a.test/">A</a> and <a href="https://b.test/">B</a>')
    expect(parts.map((p) => p.href)).toEqual(['https://a.test/', undefined, 'https://b.test/'])
  })

  // The reason this is a parser and not `{@html}`: a region admin authors these, and every
  // member of their region renders them.
  it('drops a script rather than executing it', () => {
    const parts = parseCredit('© Survey<script>alert(1)</script>')
    expect(parts.some((p) => p.text.includes('alert'))).toBe(false)
    expect(parts[0]).toEqual({ text: '© Survey' })
  })

  it('strips an event handler down to its text', () => {
    expect(parseCredit('<b onmouseover="alert(1)">Hover me</b>')).toEqual([{ text: 'Hover me' }])
  })

  it('refuses a javascript: link, keeping only its text', () => {
    expect(parseCredit('<a href="javascript:alert(1)">Click</a>')).toEqual([{ text: 'Click' }])
  })

  it('refuses a data: link', () => {
    expect(parseCredit('<a href="data:text/html,<h1>x</h1>">Click</a>')).toEqual([{ text: 'Click' }])
  })

  it('keeps the text of an unknown element, so the credit stays readable', () => {
    expect(parseCredit('<span>Bundesamt für Kartographie</span>')).toEqual([{ text: 'Bundesamt für Kartographie' }])
  })

  // A credit pasted from a provider's page routinely wraps its link in a span or a p, and a
  // link one level down is still the link the licence requires.
  it('finds a link nested inside a wrapper', () => {
    expect(parseCredit('<span><a href="https://example.test/req">X</a></span>')).toEqual([
      { href: 'https://example.test/req', text: 'X' },
    ])
  })

  it('finds a link several levels down', () => {
    expect(parseCredit('<p><em><a href="https://example.test/deep">Deep</a></em></p>')).toEqual([
      { href: 'https://example.test/deep', text: 'Deep' },
    ])
  })

  // `anchor.href` resolves these against the app's own page, so trusting it would present a
  // link back into grnyte as somebody's attribution.
  it('refuses an anchor with no href', () => {
    expect(parseCredit('<a>Click</a>')).toEqual([{ text: 'Click' }])
  })

  it('refuses an empty href', () => {
    expect(parseCredit('<a href="">Click</a>')).toEqual([{ text: 'Click' }])
  })

  // Providers write these, and dropping one leaves a required link as plain text.
  it('accepts a protocol-relative href', () => {
    expect(parseCredit('<a href="//www.bkg.bund.de/">BKG</a>')).toEqual([
      { href: 'https://www.bkg.bund.de/', text: 'BKG' },
    ])
  })

  it('refuses a relative href', () => {
    expect(parseCredit('<a href="/explore">Click</a>')).toEqual([{ text: 'Click' }])
  })

  // An anchor inside <svg> is an SVGAElement, so an instanceof test would drop its href.
  it('keeps a link inside foreign content', () => {
    expect(parseCredit('<svg><a href="https://www.bkg.bund.de/">BKG</a></svg>')).toEqual([
      { href: 'https://www.bkg.bund.de/', text: 'BKG' },
    ])
  })

  // `textContent` on the anchor would sweep these into the link label.
  it('keeps a stylesheet out of a link label', () => {
    expect(parseCredit('<a href="https://a.example/"><style>.a{fill:red}</style>Name</a>')).toEqual([
      { href: 'https://a.example/', text: 'Name' },
    ])
  })

  it('keeps SVG tooltip text out of a link label', () => {
    expect(parseCredit('<a href="https://a.example/"><svg><title>tip</title></svg>BKG</a>')).toEqual([
      { href: 'https://a.example/', text: 'BKG' },
    ])
  })

  // A logo-only credit: filtering the label out of the anchor must not take the link with it.
  it('falls back to the host when a link has no text of its own', () => {
    expect(parseCredit('<a href="https://www.bkg.bund.de/legal"><svg><title>BKG</title></svg></a>')).toEqual([
      { href: 'https://www.bkg.bund.de/legal', text: 'www.bkg.bund.de' },
    ])
  })

  it('drops a link whose label is only whitespace once filtered', () => {
    expect(parseCredit('<a><style>.a{fill:red}</style> </a>')).toEqual([])
  })

  it('reaches the xlink spelling past an empty href attribute', () => {
    expect(parseCredit('<svg><a href="" xlink:href="https://www.bkg.bund.de/">BKG</a></svg>')).toEqual([
      { href: 'https://www.bkg.bund.de/', text: 'BKG' },
    ])
  })

  it('reads the legacy SVG xlink:href spelling', () => {
    expect(parseCredit('<svg><a xlink:href="https://www.bkg.bund.de/">BKG</a></svg>')).toEqual([
      { href: 'https://www.bkg.bund.de/', text: 'BKG' },
    ])
  })

  it('drops SVG tooltip and a11y text, which is not a credit', () => {
    expect(parseCredit('© Survey<svg><title>chart</title><desc>a chart</desc></svg>')).toEqual([{ text: '© Survey' }])
  })

  // SVG and MathML keep their tag case, so an uppercased comparison is what keeps them out.
  it('drops a stylesheet inside foreign content', () => {
    expect(parseCredit('© Survey<svg><style>.a{fill:red}</style></svg>')).toEqual([{ text: '© Survey' }])
  })

  // Copied markup carries build and tracking comments; their contents are not a credit.
  it('drops comment nodes rather than rendering them', () => {
    expect(parseCredit('© Survey<!-- internal note -->')).toEqual([{ text: '© Survey' }])
  })

  it('returns nothing for an empty credit', () => {
    expect(parseCredit('')).toEqual([])
    expect(parseCredit('<span></span>')).toEqual([])
  })
})
