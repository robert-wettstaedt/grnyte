import { describe, expect, it } from 'vitest'
import { analyzeDescription, stripLink } from './migrate-video-sources'

describe('analyzeDescription', () => {
  it('finds a single matching link', () => {
    const { links, strayVideoUrls } = analyzeDescription('Nice slab.\n\n[Beta Video](https://youtu.be/abc)')
    expect(links).toEqual([
      { text: '[Beta Video](https://youtu.be/abc)', title: 'Beta Video', url: 'https://youtu.be/abc' },
    ])
    expect(strayVideoUrls).toEqual([])
  })

  it('matches titles case-insensitively and ignores non-matching links', () => {
    const { links } = analyzeDescription('[topo](https://a.com) and [VIDEO beta](https://b.com/x)')
    expect(links.map((l) => l.url)).toEqual(['https://b.com/x'])
  })

  it('ignores image embeds', () => {
    expect(analyzeDescription('![beta video](https://img.com/x.jpg)').links).toEqual([])
  })

  it('drops the URL title portion of a link', () => {
    expect(analyzeDescription('[beta](https://youtu.be/abc "hi")').links[0]?.url).toBe('https://youtu.be/abc')
  })

  it('reports bare video-host URLs and video links with other titles as stray', () => {
    const { links, strayVideoUrls } = analyzeDescription(
      'https://youtube.com/watch?v=x and [here](https://vimeo.com/1)',
    )
    expect(links).toEqual([])
    expect(strayVideoUrls).toEqual(['https://youtube.com/watch?v=x', 'https://vimeo.com/1'])
  })

  it('does not report a matching link’s own URL as stray', () => {
    expect(analyzeDescription('[beta](https://www.instagram.com/p/x/)').strayVideoUrls).toEqual([])
  })

  it('ignores matching titles whose target is prose, not a URL', () => {
    expect(analyzeDescription('[Beta-Video](folgt in Kürze)').links).toEqual([])
  })

  it('catches video-host URLs on any subdomain as stray', () => {
    expect(analyzeDescription('https://m.youtube.com/watch?v=x').strayVideoUrls).toEqual([
      'https://m.youtube.com/watch?v=x',
    ])
  })
})

describe('stripLink', () => {
  it('drops a line that only held the link (and its filler)', () => {
    expect(stripLink('Nice slab.\n\nBeta: [video](https://youtu.be/a)', '[video](https://youtu.be/a)')).toBe(
      'Nice slab.',
    )
  })

  it('keeps surrounding prose when the line says more', () => {
    expect(stripLink('Start sitting, [beta](https://youtu.be/a) shows the crux.', '[beta](https://youtu.be/a)')).toBe(
      'Start sitting, shows the crux.',
    )
  })

  it('returns an empty string when the link was the whole description', () => {
    expect(stripLink('[Beta Video](https://youtu.be/a)', '[Beta Video](https://youtu.be/a)')).toBe('')
  })
})
