export interface RouteListItem {
  createdAt: Date | undefined
  blockFk: number
  description: string
  firstAscentYear: number | undefined
  gradeFk: number | undefined
  id: number
  name: string
  rating: number
  tags: string[]
  userRating: number
}
