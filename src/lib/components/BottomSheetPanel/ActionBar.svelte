<script lang="ts">
  const { children } = $props()
</script>

<div class="w-full">
  <div
    class="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto scroll-smooth px-4 py-4 md:-mx-6 md:px-6"
  >
    {@render children()}
  </div>
</div>
