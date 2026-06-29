import * as schema from '$lib/db/schema'
import type { Grade } from '$lib/entities/grade/dto'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { describe, expect, it, vi } from 'vitest'
import { convertMarkdownToHtml, convertMarkdownToHtmlSync } from './index'

vi.mock('$lib/entities/grade/color', () => {
  return {
    getGradeColor: () => '#b91c1c',
  }
})

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({ where: vi.fn(() => [{ name: 'foo' }]) })),
  })),
} as unknown as PostgresJsDatabase<typeof schema>

describe('Markdown Conversion', () => {
  it('should convert basic markdown to HTML', async () => {
    const markdown = '# Heading\n\nParagraph text'
    const html = await convertMarkdownToHtml(markdown)
    expect(html).toContain('<h1>Heading</h1>')
    expect(html).toContain('<p>Paragraph text</p>')
  })

  it('should handle emphasis and strong text', async () => {
    const markdown = '*italic* and **bold** text'
    const html = await convertMarkdownToHtml(markdown)
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('should handle links', async () => {
    const markdown = '[Link text](https://example.com)'
    const html = await convertMarkdownToHtml(markdown)
    expect(html).toContain('<a href="https://example.com">Link text</a>')
  })

  it('should handle null input', async () => {
    const html = await convertMarkdownToHtml(null)
    expect(html).toBe('')
  })

  it('should handle undefined input', async () => {
    const html = await convertMarkdownToHtml(undefined)
    expect(html).toBe('')
  })

  it('should handle whitespace-only input', async () => {
    const html = await convertMarkdownToHtml('   \n   \t   ')
    expect(html).toBe('')
  })

  it('leaves a bare @username as plain text (remark-mentions retired)', async () => {
    const markdown = '@username mentioned something'
    const html = await convertMarkdownToHtml(markdown)
    expect(html).not.toContain('href="/users/username"')
    expect(html).toContain('@username')
  })

  it('should handle users references without db', async () => {
    const markdown = '!users:123!'
    const html = await convertMarkdownToHtml(markdown)
    expect(html).toContain('!users:123!')
  })

  it('resolves a users reference to an @username link', async () => {
    const markdown = '!users:123!'
    const html = await convertMarkdownToHtml(markdown, mockDb)
    expect(html).toContain('<a href="/users/foo"><strong>@foo</strong></a>')
  })

  it('should handle references without db', async () => {
    const markdown = '!routes:123!'
    const html = await convertMarkdownToHtml(markdown)
    expect(html).toContain('!routes:123!')
  })

  it('should handle areas references', async () => {
    const markdown = '!areas:123!'
    const html = await convertMarkdownToHtml(markdown, mockDb)
    expect(html).toContain('<a href="/areas/123"><strong>foo</strong></a>')
  })

  it('should handle blocks references', async () => {
    const markdown = '!blocks:123!'
    const html = await convertMarkdownToHtml(markdown, mockDb)
    expect(html).toContain('<a href="/blocks/123"><strong>foo</strong></a>')
  })

  it('should handle routes references', async () => {
    const markdown = '!routes:123!'
    const html = await convertMarkdownToHtml(markdown, mockDb)
    expect(html).toContain('<a href="/routes/123"><strong>foo</strong></a>')
  })

  it('renders a deleted reference as a "not found" tombstone', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => []) })),
      })),
    } as unknown as PostgresJsDatabase<typeof schema>

    const markdown = '!routes:123!'
    const html = await convertMarkdownToHtml(markdown, mockDb)
    expect(html).toContain('<span class="reference-missing">Route not found</span>')
    expect(html).not.toContain('/routes/123')
  })

  it('should handle malformed references', async () => {
    const markdown = '!routes:foo!'
    const html = await convertMarkdownToHtml(markdown, mockDb)
    expect(html).toContain('!routes:foo!')
  })

  it('should handle routes references with special characters', async () => {
    const markdown = '!routes:123!!'
    const html = await convertMarkdownToHtml(markdown, mockDb)
    expect(html).toContain('<a href="/routes/123"><strong>foo</strong></a>!')
  })

  it('should handle throwing db', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            throw new Error()
          }),
        })),
      })),
    } as unknown as PostgresJsDatabase<typeof schema>

    const markdown = '!routes:123!!'
    await expect(convertMarkdownToHtml(markdown, mockDb)).rejects.toThrowError()
  })
})

describe('Markdown grade badges', () => {
  it('renders an FB grade as a badge div with class and style', () => {
    const grades = [{ id: 0, FB: '7A+', V: '' }] as Grade[]
    const html = convertMarkdownToHtmlSync('Test 7A+ ok', grades)

    expect(html).toContain('<span class="badge font-semibold text-white" style="background: #b91c1c">7A+</span>')
  })

  it('renders a V grade as a badge div with class and style', () => {
    const grades = [{ id: 0, FB: '', V: 'V5' }] as Grade[]
    const html = convertMarkdownToHtmlSync('Go V5 now', grades)

    expect(html).toContain('<span class="badge font-semibold text-white" style="background: #b91c1c">V5</span>')
  })

  it('does not nest badges inside badges', () => {
    const grades = [{ id: 0, FB: '7A+', V: '' }] as Grade[]
    const html = convertMarkdownToHtmlSync('Test 7A+ and 7A+ again', grades)

    const badgeCount = (html.match(/<span class="badge\b/g) ?? []).length
    expect(badgeCount).toBe(2)

    // Specifically guard against the previously-seen pattern: a badge containing another badge.
    expect(html).not.toMatch(/<span class="badge[^>]*>(?:(?!<\/span>).)*<span class="badge/)
  })

  it('escapes grade labels when generating badge nodes', () => {
    const grades = [{ id: 0, FB: '7A+<', V: '' }] as Grade[]
    const html = convertMarkdownToHtmlSync('Try 7A+<', grades)

    expect(html).toMatch(/7A\+(?:&lt;|&#x3C;)/)
    expect(html).not.toContain('7A+<')
  })

  it('does not turn 7A- into 7A+ (no partial token matches)', () => {
    const grades = [{ id: 0, FB: '7A+', V: '' }] as Grade[]
    const html = convertMarkdownToHtmlSync('Try 7A- please', grades)

    expect(html).toContain('7A-')
    expect(html).not.toContain('7A+</span>-')
  })

  it('matches grades case-insensitively', () => {
    const grades = [{ id: 0, FB: '7A+', V: '' }] as Grade[]
    const html = convertMarkdownToHtmlSync('try 7a+ now', grades)

    expect(html).toContain('>7A+</span>')
  })

  it('matches when surrounded by punctuation', () => {
    const grades = [{ id: 0, FB: '7A+', V: '' }] as Grade[]
    const html = convertMarkdownToHtmlSync('do (7A+), ok.', grades)

    expect(html).toContain('<p>do (')
    expect(html).toContain('<span class="badge')
    expect(html).toMatch(/>7A\+<\/span>[),.!?]/)
    expect(html).toContain('ok.</p>')
  })

  it('does not match inside words', () => {
    const grades = [{ id: 0, FB: '7A+', V: '' }] as Grade[]
    const html = convertMarkdownToHtmlSync('x7A+ y', grades)

    expect(html).toContain('x7A+ y')
    expect(html).not.toContain('<span class="badge')
  })

  it('does not match with extra +/- characters after a token', () => {
    const grades = [{ id: 0, FB: '7A+', V: '' }] as Grade[]
    const html1 = convertMarkdownToHtmlSync('weird 7A++ case', grades)
    const html2 = convertMarkdownToHtmlSync('weird 7A+- case', grades)

    expect(html1).toContain('7A++')
    expect(html1).not.toContain('<span class="badge')

    expect(html2).toContain('7A+-')
    expect(html2).not.toContain('<span class="badge')
  })

  it('supports FB grades with spaces (matches the short token)', () => {
    const grades = [{ id: 0, FB: 'FB 7A+', V: '' }] as Grade[]
    const html = convertMarkdownToHtmlSync('try 7A+ and FB 7A+', grades)

    // Both should render with the canonical label from the grade row.
    const badges = html.match(/>FB 7A\+<\/span>/g) ?? []
    expect(badges.length).toBe(2)
  })
})

describe('Markdown users references (sync path)', () => {
  it('renders an enriched users reference as an @username link', () => {
    const enriched = `!users:5:${btoa('alice')}!`
    const html = convertMarkdownToHtmlSync(enriched, [])
    expect(html).toContain('<a href="/users/alice"><strong>@alice</strong></a>')
  })

  it('renders an enriched users reference as strong (no link) when enclosed', () => {
    const enriched = `!users:5:${btoa('alice')}!`
    const html = convertMarkdownToHtmlSync(enriched, [], 'strong')
    expect(html).toContain('<strong>@alice</strong>')
    expect(html).not.toContain('href')
  })
})
