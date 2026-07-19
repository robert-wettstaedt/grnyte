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
  }

  let { crumbs, href, name }: Props = $props()
</script>

<Row title={name} {crumbs} {href}>
  <Avatar {name} size={52} />
</Row>
