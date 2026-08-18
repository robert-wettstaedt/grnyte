<script lang="ts">
  import { ENTITY_TYPE_ICON } from '$lib/components/EntitySearch/search.svelte'
  import type { Snippet } from 'svelte'
  import Row from './Row.svelte'
  import Thumb from './Thumb.svelte'

  interface Props {
    /** Trailing action inside the card (e.g. a remove button). */
    action?: Snippet
    /** Breadcrumb path of parent areas. */
    crumbs?: string | string[]
    /** Render as a link. */
    href?: string
    /** Block name. */
    name: string
    /** `files.path` of the block's first topo image — shown instead of the
     *  decorative default when present. */
    topoImagePath?: string
    /** Layout variant, passed through to {@link Row}: `option` is the flat, tighter row
     *  for nesting inside another card (e.g. an event card). */
    variant?: 'card' | 'option'
  }

  let { action, crumbs, href, name, topoImagePath, variant }: Props = $props()
</script>

<Row title={name} {action} {crumbs} {href} {variant}>
  <Thumb imagePath={topoImagePath} fallback={ENTITY_TYPE_ICON.blocks} />
</Row>
