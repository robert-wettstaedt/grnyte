import { command } from '$app/server'
import z from 'zod'

// TODO
export const createBlock = command(z.object({ areaId: z.number() }), async ({ areaId }) => {})
