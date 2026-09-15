import { describe, expect, it } from 'vitest'
import { renderLegal } from './links'

describe('renderLegal', () => {
  // The caps come from `region/dto`, so they resolve here. Tokens backed by `$env/static/public`
  // are inlined at build time and are undefined under vitest, which is why none are asserted on.
  it('substitutes a known token', () => {
    expect(renderLegal('a region holds {maxMembers} members.')).toMatch(/holds \d+ members/)
  })

  it('strips authored comments, which are guidance for the next editor and not content', () => {
    const html = `<!-- Deliberately absent: the upmove reasoning, and OGH 7 Ob 80/17s. -->
<p>The answer itself.</p>`

    const out = renderLegal(html)

    expect(out).not.toContain('<!--')
    expect(out).not.toContain('OGH 7 Ob 80/17s')
    expect(out).toContain('<p>The answer itself.</p>')
  })

  it('strips a comment spanning several lines, which is how they are actually written', () => {
    const out = renderLegal(`<!--\n  first line\n  second line\n-->\n<p>kept</p>`)

    expect(out).not.toContain('first line')
    expect(out).toContain('<p>kept</p>')
  })

  it('strips each comment separately rather than everything between the first and last', () => {
    const out = renderLegal(`<!-- one --><p>middle</p><!-- two -->`)

    expect(out).toContain('<p>middle</p>')
    expect(out).not.toContain('one')
    expect(out).not.toContain('two')
  })

  // Comments come out before tokens, so a token parked inside one cannot throw on an unknown key.
  it('ignores a token inside a comment', () => {
    expect(() => renderLegal('<!-- {noSuchToken} --><p>fine</p>')).not.toThrow()
  })

  it('throws on an unknown token in the copy itself, where a typo would otherwise publish literally', () => {
    expect(() => renderLegal('<p>write to {contactMail}</p>')).toThrow(/unknown token/)
  })

  // `$&` in a string replacement would re-insert the matched token instead of the value; a function
  // replacement never expands dollar sequences, whatever a deployment puts in an address.
  it('does not expand dollar sequences from a substituted value', () => {
    expect(renderLegal('<p>{maxRegions}</p>')).not.toContain('{maxRegions}')
  })
})
