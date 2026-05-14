import * as schema from '$lib/db/schema'
import { convertMarkdownToHtml, convertMarkdownToHtmlSync, replaceMention } from '$lib/markdown'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { describe, expect, it, vi } from 'vitest'

vi.mock('$lib/grades', () => {
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

  it('should handle mentions', async () => {
    const markdown = '@username mentioned something'
    const html = await convertMarkdownToHtml(markdown)
    expect(html).toContain('<a href="/users/username"><strong>@username</strong></a>')
  })

  it('should handle multiple mentions', async () => {
    const markdown = '@user1 and @user2 are collaborating'
    const html = await convertMarkdownToHtml(markdown)
    expect(html).toContain('<a href="/users/user1"><strong>@user1</strong></a>')
    expect(html).toContain('<a href="/users/user2"><strong>@user2</strong></a>')
  })

  it('should handle mentions in formatted text', async () => {
    const markdown = '**@user** wrote in *@group*'
    const html = await convertMarkdownToHtml(markdown)
    expect(html).toContain('<strong><a href="/users/user"><strong>@user</strong></a></strong>')
    expect(html).toContain('<em><a href="/users/group"><strong>@group</strong></a></em>')
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

  it('should handle missing references', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => []) })),
      })),
    } as unknown as PostgresJsDatabase<typeof schema>

    const markdown = '!routes:123!'
    const html = await convertMarkdownToHtml(markdown, mockDb)
    expect(html).toContain('!routes:123!')
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
    const grades = [{ FB: '7A+', V: null }] as any
    const html = convertMarkdownToHtmlSync('Test 7A+ ok', grades)

    expect(html).toContain('<span class="badge font-semibold text-white" style="background: #b91c1c">7A+</span>')
  })

  it('renders a V grade as a badge div with class and style', () => {
    const grades = [{ FB: null, V: 'V5' }] as any
    const html = convertMarkdownToHtmlSync('Go V5 now', grades)

    expect(html).toContain('<span class="badge font-semibold text-white" style="background: #b91c1c">V5</span>')
  })

  it('does not nest badges inside badges', () => {
    const grades = [{ FB: '7A+', V: null }] as any
    const html = convertMarkdownToHtmlSync('Test 7A+ and 7A+ again', grades)

    const badgeCount = (html.match(/<span class="badge\b/g) ?? []).length
    expect(badgeCount).toBe(2)

    // Specifically guard against the previously-seen pattern: a badge containing another badge.
    expect(html).not.toMatch(/<span class="badge[^>]*>(?:(?!<\/span>).)*<span class="badge/)
  })

  it('escapes grade labels when generating badge nodes', () => {
    const grades = [{ FB: '7A+<', V: null }] as any
    const html = convertMarkdownToHtmlSync('Try 7A+<', grades)

    expect(html).toMatch(/7A\+(?:&lt;|&#x3C;)/)
    expect(html).not.toContain('7A+<')
  })

  it('does not turn 7A- into 7A+ (no partial token matches)', () => {
    const grades = [{ FB: '7A+', V: null }] as any
    const html = convertMarkdownToHtmlSync('Try 7A- please', grades)

    expect(html).toContain('7A-')
    expect(html).not.toContain('7A+</span>-')
  })

  it('matches grades case-insensitively', () => {
    const grades = [{ FB: '7A+', V: null }] as any
    const html = convertMarkdownToHtmlSync('try 7a+ now', grades)

    expect(html).toContain('>7A+</span>')
  })

  it('matches when surrounded by punctuation', () => {
    const grades = [{ FB: '7A+', V: null }] as any
    const html = convertMarkdownToHtmlSync('do (7A+), ok.', grades)

    expect(html).toContain('<p>do (')
    expect(html).toContain('<span class="badge')
    expect(html).toMatch(/>7A\+<\/span>[),.!?]/)
    expect(html).toContain('ok.</p>')
  })

  it('does not match inside words', () => {
    const grades = [{ FB: '7A+', V: null }] as any
    const html = convertMarkdownToHtmlSync('x7A+ y', grades)

    expect(html).toContain('x7A+ y')
    expect(html).not.toContain('<span class="badge')
  })

  it('does not match with extra +/- characters after a token', () => {
    const grades = [{ FB: '7A+', V: null }] as any
    const html1 = convertMarkdownToHtmlSync('weird 7A++ case', grades)
    const html2 = convertMarkdownToHtmlSync('weird 7A+- case', grades)

    expect(html1).toContain('7A++')
    expect(html1).not.toContain('<span class="badge')

    expect(html2).toContain('7A+-')
    expect(html2).not.toContain('<span class="badge')
  })

  it('supports FB grades with spaces (matches the short token)', () => {
    const grades = [{ FB: 'FB 7A+', V: null }] as any
    const html = convertMarkdownToHtmlSync('try 7A+ and FB 7A+', grades)

    // Both should render with the canonical label from the grade row.
    const badges = html.match(/>FB 7A\+<\/span>/g) ?? []
    expect(badges.length).toBe(2)
  })
})

describe('replaceMention', () => {
  it('should replace a single mention', () => {
    const markdown = '@olduser wrote something'
    const result = replaceMention(markdown, 'olduser', 'newuser')
    expect(result).toBe('@newuser wrote something')
  })

  it('should replace multiple mentions of the same user', () => {
    const markdown = '@olduser wrote something and then @olduser wrote again'
    const result = replaceMention(markdown, 'olduser', 'newuser')
    expect(result).toBe('@newuser wrote something and then @newuser wrote again')
  })

  it('should only replace exact username matches', () => {
    const markdown = '@olduser @olduser123 @old_user'
    const result = replaceMention(markdown, 'olduser', 'newuser')
    expect(result).toBe('@newuser @olduser123 @old_user')
  })

  it('should handle mentions within formatted text', () => {
    const markdown = '**@olduser** wrote in *@olduser*'
    const result = replaceMention(markdown, 'olduser', 'newuser')
    expect(result).toBe('**@newuser** wrote in *@newuser*')
  })

  it('should handle mentions at the end of text', () => {
    const markdown = 'Message from @olduser'
    const result = replaceMention(markdown, 'olduser', 'newuser')
    expect(result).toBe('Message from @newuser')
  })

  it('should handle null input', () => {
    const result = replaceMention(null, 'olduser', 'newuser')
    expect(result).toBeUndefined()
  })

  it('should handle undefined input', () => {
    const result = replaceMention(undefined, 'olduser', 'newuser')
    expect(result).toBeUndefined()
  })

  it('should handle empty string input', () => {
    const result = replaceMention('', 'olduser', 'newuser')
    expect(result).toBe('')
  })

  it('should handle text without mentions', () => {
    const markdown = 'Just some regular text without mentions'
    const result = replaceMention(markdown, 'olduser', 'newuser')
    expect(result).toBe('Just some regular text without mentions')
  })

  it('should handle text with similar but not exact mentions', () => {
    const markdown = '@oldusertest @testolduser @olduser_test'
    const result = replaceMention(markdown, 'olduser', 'newuser')
    expect(result).toBe('@oldusertest @testolduser @olduser_test')
  })

  it('should preserve surrounding punctuation', () => {
    const markdown = 'Hey @olduser! How are you? (@olduser)'
    const result = replaceMention(markdown, 'olduser', 'newuser')
    expect(result).toBe('Hey @newuser! How are you? (@newuser)')
  })
})
