import { describe, expect, it } from 'vitest'
import { enrichMarkdownWithReferences, getReferences } from './remark-references'

describe('enrichMarkdownWithReferences', () => {
  it('enriches a token whatever its case, like `getReferences` resolves it', () => {
    const out = enrichMarkdownWithReferences('Cap !Routes:4! low !routes:4!', [{ id: 4, name: 'Riss', type: 'routes' }])
    expect(out).not.toContain('!Routes:4!')
    expect(out).not.toContain('!routes:4!')
  })
})

describe('getReferences', () => {
  it('collects ids per type', () => {
    expect(getReferences('see !routes:4! and !users:7!')).toEqual({ areas: [], blocks: [], routes: [4], users: [7] })
  })

  it('reads a token whatever its case, since the match ignores it', () => {
    expect(getReferences('hi !Users:3! on !BLOCKS:9!')).toEqual({ areas: [], blocks: [9], routes: [], users: [3] })
  })
})
