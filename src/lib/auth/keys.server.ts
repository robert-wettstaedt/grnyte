import { SUPABASE_SECRET_KEY } from '$env/static/private'
import { createHmac } from 'node:crypto'

/** A key derived for one purpose: domain-separated from the secret key and as secret as it. Never reuse a label. */
export const labelledKey = (label: string): string =>
  createHmac('sha256', SUPABASE_SECRET_KEY).update(label).digest('hex')
