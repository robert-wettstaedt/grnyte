import { GRADE_COLORS } from '$lib/entities/grade/color'
import { describe, expect, it } from 'vitest'
import { renderEmailHtml, renderEmailText, type EmailInput } from './shell'
import { GOTRUE_TEMPLATES } from './templates'

const base: EmailInput = {
  action: { label: 'Claim your seat', url: 'https://grnyte.rocks/auth/confirm?token_hash=abc&type=invite&next=/' },
  body: ['First paragraph.', 'Second paragraph.'],
  footnote: 'If you were not expecting this, ignore this email.',
  meta: 'INVITE · LINK EXPIRES IN 24 HOURS',
  preheader: 'Open the link to claim your seat.',
  subject: 'You are invited to grnyte',
  title: 'Someone saved you a seat',
}

/** Colours only ever appear as literal 6-digit hex. Anything else breaks a mail client. */
const COLOR_PROPERTY = /(?:background-color|border-top-color|border-color|color)\s*:\s*([^;"!]+)/g

describe('renderEmailHtml', () => {
  it('emits only colour forms every mail client can parse', () => {
    const html = renderEmailHtml(base)

    // `var()` never registers in Gmail, Fastmail or Mail.ru, and one inline `oklch()` makes
    // Gmail drop the entire style attribute on that element.
    for (const banned of ['var(', 'oklch(', 'rgba(', 'rgb(']) {
      expect(html).not.toContain(banned)
    }

    // Pure white inverts to pure black and back, the harshest possible result. #FDFBFA costs
    // 0.22 of contrast and buys this assertion.
    expect(html).not.toContain('#FFFFFF')
    expect(html).not.toContain('#000000')

    // 3-digit hex. The lookbehind spares HTML entities like &#847; in the preheader padding.
    expect(html).not.toMatch(/(?<!&)#[0-9a-fA-F]{3}(?![0-9a-fA-F])/)

    for (const [, value] of html.matchAll(COLOR_PROPERTY)) {
      expect(value.trim()).toMatch(/^(?:#[0-9A-Fa-f]{6}|inherit)$/)
    }

    for (const [, value] of html.matchAll(/bgcolor="([^"]+)"/g)) {
      expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('escapes slot content so a display name cannot inject markup', () => {
    const html = renderEmailHtml({ ...base, title: '<a href="https://evil.test">Reset now</a>' })

    expect(html).toContain('&lt;a href=&quot;https://evil.test&quot;&gt;')
    expect(html).not.toContain('<a href="https://evil.test"')
  })

  it('leaves Go template expressions intact, which is what lets GoTrue share the shell', () => {
    const html = renderEmailHtml({ ...base, body: ['Moving your account to {{ .NewEmail }}.'], code: '{{ .Token }}' })

    expect(html).toContain('Moving your account to {{ .NewEmail }}.')
    expect(html).toContain('{{ .Token }}')
  })

  it('escapes the ampersands in a token URL, in the href and in the pasteable copy', () => {
    const html = renderEmailHtml(base)

    expect(html).toContain('href="https://grnyte.rocks/auth/confirm?token_hash=abc&amp;type=invite&amp;next=/"')
    expect(html).not.toMatch(/token_hash=abc&type=/)
  })

  it('drops the button, the fallback URL and the hairline when their slots are absent', () => {
    const html = renderEmailHtml({ ...base, action: undefined, footnote: undefined })

    // The class names still exist in the <style> block; what must be gone is the markup.
    expect(html).not.toContain('class="btn-a"')
    expect(html).not.toContain('class="rule"')
    // The masthead and the grade rule are not optional.
    expect(html).toContain('grnyte')
    expect(html).toContain(GRADE_COLORS[0])
  })

  it('spans the band and the content across the grade rule columns', () => {
    const html = renderEmailHtml(base)
    const gradeCells = [...html.matchAll(/border-top:3px solid #/g)].length

    // The grade rule is the card table's first row, so it decides the column count. Without a
    // matching colspan the single-cell rows under it collapse into the first 25% column, which
    // renders as a card with a quarter-width masthead and a squeezed text column.
    expect(gradeCells).toBe(4)
    expect([...html.matchAll(/colspan="4"/g)]).toHaveLength(2)
  })

  it('carries every colour both inline and as a class, so the dark-mode block can override it', () => {
    const html = renderEmailHtml(base)

    expect(html).toContain('@media (prefers-color-scheme:dark)')
    // Outlook.com and new Outlook expose nothing but these attributes.
    expect(html).toContain('[data-ogsc] .ink')
    expect(html).toContain('class="ink h1-sm"')
  })

  it('renders the recipient locale into both lang attributes and the footer copy', () => {
    const html = renderEmailHtml({ ...base, locale: 'de' })

    expect(html).toContain('<html lang="de"')
    expect(html).toContain('<div lang="de"')
    expect(html).toContain('grnyte fragt dich nie per E-Mail nach deinem Passwort.')
  })
})

describe('renderEmailText', () => {
  it('spells out the URL, because the plaintext part has no button to click', () => {
    const text = renderEmailText(base)

    expect(text).toContain('Claim your seat:\nhttps://grnyte.rocks/auth/confirm?token_hash=abc&type=invite&next=/')
    expect(text).toContain('Someone saved you a seat')
    expect(text).not.toContain('<')
  })
})

describe('GOTRUE_TEMPLATES', () => {
  it('covers all 13 template types Supabase Auth can send', () => {
    expect(Object.keys(GOTRUE_TEMPLATES)).toHaveLength(13)
  })

  it.each(Object.entries(GOTRUE_TEMPLATES))('renders %s', (key, content) => {
    const html = renderEmailHtml({ ...content, origin: '{{ .SiteURL }}' })

    expect(html).toContain(content.title)
    expect(html.length).toBeGreaterThan(2000)
    expect(html).not.toMatch(/(?<!&)#[0-9a-fA-F]{3}(?![0-9a-fA-F])/)
    // A stray em-dash or a stray `<no value>` from a variable the template does not have are
    // both invisible until the mail is already in somebody's inbox.
    expect(html).not.toContain('—')
    expect(html).not.toContain('<no value>')
    expect(key).toMatch(/^[a-z_]+$/)
  })

  it('gives reauthentication a code and no link, because it has neither TokenHash nor ConfirmationURL', () => {
    expect(GOTRUE_TEMPLATES.reauthentication.code).toBe('{{ .Token }}')
    expect(GOTRUE_TEMPLATES.reauthentication).not.toHaveProperty('action')
  })

  it('routes every link through our own confirm handler with a path-only next', () => {
    for (const content of Object.values(GOTRUE_TEMPLATES)) {
      const url = (content as { action?: { url: string } }).action?.url
      if (url == null || !url.includes('token_hash')) continue

      expect(url).toContain('{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}')
      // `next` is assigned straight to `redirectTo.pathname`, so an absolute URL mangles it.
      expect(url).toMatch(/&next=\/[a-z/-]*$/)
    }
  })
})
