/** The Move and Merge sheets of one action menu. Each mounts on first use: the sheets run queries,
 *  which a page that never opens them should not pay for. */
export class RestructureSheets {
  merging = $state(false)
  moving = $state(false)
  used = $state({ merge: false, move: false })

  merge = () => {
    this.used.merge = true
    this.merging = true
  }

  move = () => {
    this.used.move = true
    this.moving = true
  }
}
