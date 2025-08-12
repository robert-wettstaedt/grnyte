<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'

  goto(page.url.pathname.split('/routes')[0] + '?tab=topo', { replaceState: true })
</script>
