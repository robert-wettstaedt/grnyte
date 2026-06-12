export interface RouteListItem {
  createdAt: Date | undefined
  blockFk: number
  description: string
  firstAscentYear: number | undefined
  gradeFk: number | undefined
  id: number
  name: string
  rating: number
  slug: string
  tags: string[]
  userRating: number
}
