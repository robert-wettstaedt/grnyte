/** A list's select mode: its rows turn into checkboxes until Done, and the ticked ids move together. */
export class Selection {
  active = $state(false)
  picked = $state<number[]>([])

  done = () => {
    this.active = false
    this.picked = []
  }

  has = (id: number) => this.picked.includes(id)

  start = () => {
    this.picked = []
    this.active = true
  }

  toggle = (id: number) => {
    this.picked = this.has(id) ? this.picked.filter((picked) => picked !== id) : [...this.picked, id]
  }
}
