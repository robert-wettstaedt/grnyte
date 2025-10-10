import { query } from '$app/server'
import { PUBLIC_ZERO_URL } from '$env/static/public'
import { getStatus, statusSchema } from '$lib/bunny'
import { upfetch } from '$lib/config'
import { getNextcloud } from '$lib/nextcloud/nextcloud.server'

export const getZeroStatus = query(async () => {
  try {
    const res = await fetch(PUBLIC_ZERO_URL)
    const body = await res.text()
    return body === 'OK'
  } catch (error) {
    return false
  }
})

export const getSupabaseStatus = query(async () => {
  try {
    const { status } = await upfetch('https://status.supabase.com/api/v2/status.json', { schema: statusSchema })
    return status.indicator === 'none'
  } catch (error) {
    return false
  }
})

export const getNextcloudStatus = query(async () => {
  try {
    const exists = await getNextcloud().exists('/')
    return exists
  } catch (error) {
    return false
  }
})

export const getBunnyStatus = query(async () => {
  try {
    const { status } = await getStatus()
    return status.indicator === 'none'
  } catch (error) {
    return false
  }
})
