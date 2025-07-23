<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'

  goto(page.url.pathname.split('/_/blocks')[0] + '?tab=blocks', { replaceState: true })
</script>
