import { expect, it } from 'vitest'
import { createReferenceExtension } from './reference-node'

const { markdownTokenizer } = createReferenceExtension({
  resolveLabel: () => undefined,
  suggestion: { char: '@' },
}).config

// The renderer reads `!Routes:5!` as a reference; the editor has to agree or saves it as text.
it('reads a reference token in any case, as its lowercase type', () => {
  const src = 'see !Routes:5! here'

  const start = markdownTokenizer?.start as (src: string) => number
  expect(start(src)).toBe(4)
  expect(markdownTokenizer?.tokenize?.(src.slice(4), [], {} as never)).toMatchObject({
    raw: '!Routes:5!',
    refId: '5',
    refType: 'routes',
  })
})
