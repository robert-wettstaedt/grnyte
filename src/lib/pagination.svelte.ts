import { z } from 'zod'

export const DEFAULT_PAGE_SIZE = 15

export const paginationParamsSchema = z.object({
  pageSize: z.number().default(DEFAULT_PAGE_SIZE),
})
export type PaginationParams = z.TypeOf<typeof paginationParamsSchema>

export const hasReachedEnd = (currentLength: number, pageSize = DEFAULT_PAGE_SIZE): boolean => {
  if (currentLength === 0) {
    return false
  }
  return currentLength % pageSize !== 0
}
