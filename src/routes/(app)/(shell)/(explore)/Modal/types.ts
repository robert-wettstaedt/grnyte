import type { Snippet } from 'svelte'

export interface ModalProps {
  children?: Snippet
  onclose?: () => void
  open?: boolean
}
