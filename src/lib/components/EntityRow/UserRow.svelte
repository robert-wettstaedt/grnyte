<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import Row from './Row.svelte'

  interface Props {
    /** Breadcrumb path, e.g. the shared region(s). */
    crumbs?: string | string[]
    /** Render as a link. */
    href?: string
    /** Display name. */
    name: string
    /** Layout variant, passed through to {@link Row}: `option` is the flat, tighter row
     *  for nesting inside another card (e.g. an activity card). */
    variant?: 'card' | 'option'
  }

  let { crumbs, href, name, variant }: Props = $props()
</script>

<Row title={name} {crumbs} {href} {variant}>
  <Avatar {name} size={52} />
</Row>
