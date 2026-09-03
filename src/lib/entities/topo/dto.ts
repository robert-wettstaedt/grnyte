export interface TopoLine {
  gradeFk: number | undefined
  /** `topo_routes` row id. */
  id: number
  name: string
  points: TopoPoint[]
  routeId: number
  topType: 'top' | 'topout'
}

/** One parsed point of a topo line, in its stored coordinate space (0–1 fractions or legacy pixels). */
export interface TopoPoint {
  id: string
  type: 'middle' | 'start' | 'top'
  x: number
  y: number
}

export interface TopoView {
  /** `topos` row id. */
  id: number
  /** Stored EXIF-oriented pixel height; see {@link TopoView.imageWidth}. */
  imageHeight?: number
  /** `files.path` for the topo image, fed to the `Image` component. */
  imagePath: string
  /** Stored EXIF-oriented pixel width of the topo image: lets the viewer size its
   *  box and overlay before the photo loads. Missing for files not yet backfilled. */
  imageWidth?: number
  lines: TopoLine[]
}
