<script lang="ts">
  import { ENTITY_TYPE_ICON } from '$lib/components/EntitySearch/search.svelte'
  import GradeDonut from '$lib/components/GradeDonut/GradeDonut.svelte'
  import type { Snippet } from 'svelte'
  import Row from './Row.svelte'
  import RowDescription from './RowDescription.svelte'
  import Thumb from './Thumb.svelte'

  interface Props {
    /** Trailing action inside the card (e.g. a remove button). */
    action?: Snippet
    /** Route counts keyed by grade id (`gradeFk`), drives the donut. */
    countByGrade?: Map<number, number>
    /** Breadcrumb path of parent areas. */
    crumbs?: string | string[]
    description?: string
    /** Render as a link. */
    href?: string
    /** Area name. */
    name: string
    /** Total routes, shown in the donut centre. */
    total?: number
    /** Layout variant, passed through to {@link Row}: `option` is the flat, tighter row
     *  for nesting inside another card (e.g. an event card). */
    variant?: 'card' | 'option'
  }

  let { action, countByGrade, crumbs, description, href, name, total, variant }: Props = $props()
</script>

{#snippet body()}
  <RowDescription markdown={description} />
{/snippet}

<Row title={name} {action} {crumbs} description={body} {href} {variant}>
  {#if countByGrade != null && total != null}
    <GradeDonut {countByGrade} {total} size={52} />
  {:else}
    <Thumb fallback={ENTITY_TYPE_ICON.areas} />
  {/if}
</Row>
