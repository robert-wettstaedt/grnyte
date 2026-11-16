import { command } from '$app/server'
import { passwordSchema } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import * as body from './password.server'

export const setNewPassword = command(z.object({ password: passwordSchema }), body.setNewPassword)
