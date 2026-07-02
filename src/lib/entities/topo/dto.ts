/** One parsed point of a topo line, in its stored coordinate space (0–1 fractions or legacy pixels). */
export interface TopoPoint {
  id: string
  type: 'start' | 'middle' | 'top'
  x: number
  y: number
}

export interface TopoLine {
  /** `topo_routes` row id. */
  id: number
  routeId: number
  name: string
  topType: 'top' | 'topout'
  gradeFk: number | undefined
  points: TopoPoint[]
}

export interface TopoView {
  /** `topos` row id. */
  id: number
  /** `files.path` for the topo image, fed to the `Image` component. */
  imagePath: string
  /** Stored EXIF-oriented pixel width of the topo image — lets the viewer size its
   *  box and overlay before the photo loads. Missing for files not yet backfilled. */
  imageWidth?: number
  /** Stored EXIF-oriented pixel height; see {@link TopoView.imageWidth}. */
  imageHeight?: number
  lines: TopoLine[]
}
