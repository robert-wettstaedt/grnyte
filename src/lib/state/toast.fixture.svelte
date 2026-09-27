<script lang="ts">
  import Toaster from '$lib/components/Toaster/Toaster.svelte'
  import { toaster } from '$lib/state/toast'

  let { fix = undefined }: { fix?: null | number } = $props()

  // BlockForm's one-shot geolocation effect: reads two sources, then writes one of them, so a
  // re-run inside the same flush leaves the effect with fewer dependencies than it started with.
  let locating = $state(true)

  $effect(() => {
    if (!locating) return
    const current = fix
    if (current === undefined) return
    locating = false
    if (current === null) {
      toaster.create({ title: 'could not locate', type: 'error' })
    }
  })
</script>

<Toaster />
