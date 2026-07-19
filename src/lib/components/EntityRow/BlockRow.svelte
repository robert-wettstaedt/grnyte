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
  }

  let { action, crumbs, href, name, topoImagePath }: Props = $props()
</script>

<Row title={name} {action} {crumbs} {href}>
  <Thumb imagePath={topoImagePath} fallback={ENTITY_TYPE_ICON.blocks} />
</Row>
