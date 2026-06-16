import { command } from '$app/server'
import z from 'zod'

// TODO(2.0): persist the area (insert row, derive region from parent, store the
// markdown `description`). This is intentionally a non-persisting stub — the
// add-area form, including the WYSIWYG description, is fully wired, but creation
// itself is separate work. It throws (rather than returning a fake id) so callers
// surface the unimplemented state instead of navigating to a non-existent area.
export const createArea = command(
  z.object({
    name: z.string(),
    parentFk: z.number(),
    description: z.string().optional(),
  }),
  async (): Promise<{ id: number }> => {
    throw new Error('createArea is not implemented yet')
  },
)
