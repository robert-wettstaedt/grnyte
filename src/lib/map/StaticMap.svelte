<!--
  A non-interactive map thumbnail: OSM raster tiles as plain `<img>` tags with pins positioned
  on top. Deliberately not an OpenLayers instance: a feed card that opens with five location
  changes would otherwise spin up five maps, each with its own canvas, for a picture nobody
  pans. The view fits every point it is given.
-->
<script lang="ts" module>
  import type { Coords } from './map'

  export interface StaticMapPoint extends Coords {
    /** A rough pin (EXIF backfill, or flagged approximate by its author), drawn dashed. */
    estimated?: boolean
    /** `from` is where a pin used to be, `gone` one that has been removed entirely. */
    variant?: 'from' | 'gone' | 'pin'
  }
</script>

<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import { APPROACH_COLOR, osmTileUrl, pointPx, TILE_SIZE, tileView } from './tiles'

  interface Props {
    class?: string
    height?: number
    /** Announced to screen readers, which cannot read the tiles. */
    label?: string
    /** Approach paths, drawn as solid lines. The view fits these as well as the pins: a path
     *  cropped at the edge says less about the walk in than no path at all. */
    paths?: Coords[][]
    points: StaticMapPoint[]
    width?: number
  }

  const { class: className, height = 135, label, paths = [], points, width = 240 }: Props = $props()

  const view = $derived(tileView([...points, ...paths.flat()], width, height))
  const placed = $derived(points.map((point) => ({ ...point, ...pointPx(point, view) })))
  const lines = $derived(
    paths.flatMap((path) => {
      const drawn = path.map((point) => pointPx(point, view))
      // One point is not a line, and `polyline` would render it as nothing anyway.
      return drawn.length < 2 ? [] : [drawn.map(({ left, top }) => `${left},${top}`).join(' ')]
    }),
  )

  // Tiles are the one part that talks to the network. If they cannot be reached the caller's
  // caption still says what happened, so the thumbnail removes itself rather than showing a hole.
  let failed = $state(false)
</script>

{#if !failed}
  <div
    class={['border-surface-200-800 relative max-w-full overflow-hidden rounded-lg border', className]}
    style="width: {width}px; height: {height}px"
    role="img"
    aria-label={label ?? m.map_thumbnailLabel()}
  >
    <!-- Only the raster tiles inverted in dark mode, so the pins keep their colors. Mirrors
         the treatment the full map gives its OSM layer. -->
    <div class="tiles absolute inset-0">
      {#each view.tiles as tile (tile.key)}
        <!-- Deliberately no `crossorigin`, so these stay `no-cors` and their responses opaque.
             The worker will not store an opaque response (it cannot read one, so it cannot tell a
             map from OSM's rate-limit tile, and browsers pad it to several MB against the origin's
             quota), which costs these thumbnails nothing: a tile the map layer already cached is
             served from there, and `onerror` below is fatal to the whole thumbnail, so a network
             that strips `access-control-allow-origin` would take the pins and the attribution with
             it. -->
        <img
          alt=""
          class="absolute max-w-none"
          draggable="false"
          height={TILE_SIZE}
          loading="lazy"
          onerror={() => (failed = true)}
          src={osmTileUrl(view.zoom, tile.x, tile.y)}
          style="left: {tile.left}px; top: {tile.top}px"
          width={TILE_SIZE}
        />
      {/each}
    </div>

    {#if placed.length === 2 || lines.length > 0}
      <svg class="text-primary-500 pointer-events-none absolute inset-0" {height} {width} aria-hidden="true">
        <!-- Two pins are a before and an after, so the eye needs the line between them. -->
        {#if placed.length === 2}
          <line
            stroke="currentColor"
            stroke-dasharray="4 3"
            stroke-width="2"
            x1={placed[0].left}
            x2={placed[1].left}
            y1={placed[0].top}
            y2={placed[1].top}
          />
        {/if}

        <!-- The blue `createPathLayer` draws on the real map, so an approach reads as the same
             thing in the thumbnail as it does when the reader opens it. Solid, which is what
             keeps it apart from the dashed line above. -->
        {#each lines as line, index (index)}
          <polyline
            fill="none"
            points={line}
            stroke={APPROACH_COLOR}
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
          />
        {/each}
      </svg>
    {/if}

    <!-- An estimated pin carries a "?", the same way the interactive map marks a block whose
         location is a guess (see `layers.svelte.ts`). The dashed ring alone was too quiet to
         read at thumbnail size, and it is the one thing about the pin worth noticing. -->
    {#each placed as point, index (index)}
      <span
        class={[
          'absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 shadow-sm',
          point.estimated ? 'size-4 border-dashed text-[9px] leading-none font-bold' : 'size-3.5 border-solid',
          point.variant === 'from'
            ? 'bg-surface-50-950 border-surface-500 text-surface-950-50'
            : point.variant === 'gone'
              ? 'bg-error-500 border-white text-white'
              : 'bg-primary-500 border-white text-white',
        ]}
        style="left: {point.left}px; top: {point.top}px"
      >
        {#if point.estimated}?{/if}
      </span>
    {/each}

    <a
      class="text-surface-950-50 bg-surface-50-950/70 absolute right-0 bottom-0 rounded-tl px-1 text-[10px] leading-tight"
      href="https://www.openstreetmap.org/copyright"
      rel="noreferrer"
      target="_blank"
    >
      © OpenStreetMap
    </a>
  </div>
{/if}

<style>
  :global(.dark) .tiles {
    filter: invert(1) hue-rotate(180deg) saturate(0.4) brightness(0.9) contrast(0.95);
  }
</style>
