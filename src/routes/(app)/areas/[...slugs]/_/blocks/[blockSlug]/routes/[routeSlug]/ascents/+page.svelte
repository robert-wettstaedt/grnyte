<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'

  const { slugs, blockSlug, routeSlug } = page.params
  const mergedPath = ['areas', slugs, '_', 'blocks', blockSlug, 'routes', routeSlug].join('/')
  goto('/' + mergedPath + '?tab=activity', { replaceState: true })
</script>
