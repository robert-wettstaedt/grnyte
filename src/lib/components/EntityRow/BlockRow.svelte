<script lang="ts">
  import { ENTITY_TYPE_ICON } from '$lib/components/EntitySearch/search.svelte'
  import type { Snippet } from 'svelte'
  import Row from './Row.svelte'
  import RowDescription from './RowDescription.svelte'
  import Thumb from './Thumb.svelte'

  interface Props {
    /** Trailing action inside the card (e.g. a remove button). */
    action?: Snippet
    /** Breadcrumb path of parent areas. */
    crumbs?: string | string[]
    /** Secondary line: the block's description, rendered as one clamped line of markdown. */
    description?: string
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

  let { action, crumbs, description, href, name, topoImagePath, variant }: Props = $props()
</script>

{#snippet body()}
  <RowDescription markdown={description} />
{/snippet}

<Row title={name} {action} {crumbs} description={body} {href} {variant}>
  <Thumb imagePath={topoImagePath} fallback={ENTITY_TYPE_ICON.blocks} />
</Row>
