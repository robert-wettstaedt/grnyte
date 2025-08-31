<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'

  const { slugs, blockSlug } = page.params
  const mergedPath = ['areas', slugs, '_', 'blocks', blockSlug].join('/')
  goto('/' + mergedPath + '?tab=topo', { replaceState: true })
</script>
