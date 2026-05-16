<script lang="ts">
  const { children } = $props()
</script>

<div class="w-full">
  <div class="flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto scroll-smooth py-4">
    {@render children()}
  </div>
</div>
