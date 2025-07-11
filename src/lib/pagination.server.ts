import { z } from 'zod'

export const paginationParamsSchema = z.object({
  page: z.number().default(1),
  pageSize: z.number().default(15),
})
export type PaginationParams = z.TypeOf<typeof paginationParamsSchema>

export const getPaginationQuery = (params: PaginationParams) => ({
  offset: (params.page - 1) * params.pageSize,
  limit: params.pageSize,
})

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type PaginatedData<T> = { pagination: Pagination } & T
