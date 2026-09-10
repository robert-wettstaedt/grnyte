<script lang="ts">
  // OSM's licence wants the credit wherever its tiles are drawn. A map with a control column
  // puts it there (`Map.svelte`); a map without one shows it in the corner, which is this. Kept
  // in one place so the two that have no column cannot drift apart on wording or position.
  //
  // Region WMS layers carry their own required credits, and only `Map.svelte`'s sheet lists
  // those. A map that draws region layers needs that sheet, not this.
</script>

<a
  class="text-surface-950-50 bg-surface-50-950/70 absolute right-0 bottom-0 rounded-tl px-1 text-[10px] leading-tight"
  href="https://www.openstreetmap.org/copyright"
  rel="noreferrer"
  target="_blank"
>
  &copy; OpenStreetMap
</a>
