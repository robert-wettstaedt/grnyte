import { command } from '$app/server'
import z from 'zod'

export const createArea = command(z.object({}), async ({}) => {})
