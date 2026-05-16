declare module 'remark-mentions' {
  import type { Root } from 'mdast'
  import type { Plugin } from 'unified'

  interface Options {
    usernameLink: (username: string) => string
  }

  const remarkPing: Plugin<[(Readonly<Options> | null | undefined)?], Root, string>
  export default remarkPing
}
