import { getContext, setContext } from 'svelte'

/**
 * How many Modal sheets a sheet sits on top of.
 *
 * A scrim only dims and blurs what paints below it, so a second sheet at the same z-index tier
 * leaves the one under it sharp and lit: two full cards of text on top of each other. The component
 * that opens the second sheet cannot answer this itself, because the same one renders at several
 * depths (a reaction chip sits on a feed card, inside the activity log, and inside a comment thread
 * opened from that log), so each Modal publishes the level of whatever its body renders.
 */
const MODAL_DEPTH = Symbol('modal-depth')

/** The level of the sheet this is rendered inside, or 0 out on the page. */
export const getModalDepth = (): number => getContext<number | undefined>(MODAL_DEPTH) ?? 0

export const setModalDepth = (depth: number): void => {
  setContext(MODAL_DEPTH, depth)
}
