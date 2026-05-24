import type { Dimensions } from '$lib/components/TopoViewer/TopoImage.svelte'
import type { Snippet } from 'svelte'

export interface ModalProps {
  base: Snippet
  children?: Snippet
  title: Snippet
}
