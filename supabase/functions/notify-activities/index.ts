import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import webpush from 'npm:web-push'

// Configuration
const NOTIFICATION_WINDOW_MINUTES = 5
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const VAPID_PUBLIC_KEY = Deno.env.get('PUBLIC_VAPID_KEY') || ''
const VAPID_PRIVATE_KEY = Deno.env.get('PRIVATE_VAPID_KEY') || ''
const VAPID_EMAIL = Deno.env.get('PUBLIC_TOPO_EMAIL') || ''

// Configure webpush
webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Type definitions based on your schema
interface Activity {
  id: number
  createdAt: string
  type: 'created' | 'updated' | 'deleted' | 'uploaded'
  userFk: number
  entityId: string
  entityType: string
  parentEntityId?: string
  parentEntityType?: string
  notified?: boolean
  entity: {
    type: string
    name: string
    object?: any
  }
  parentEntity?: {
    type: string
    name: string
    object?: any
  }
  user: {
    id: number
    username: string
    authUserFk: string
  }
}

interface NotificationGroup {
  userId: number
  authUserId: string
  username: string
  activities: Activity[]
}

interface PushSubscription {
  id: number
  authUserFk: string
  endpoint: string
  expirationTime: number | null
  p256dh: string
  auth: string
}

async function getRecentUnnotifiedActivities(): Promise<Activity[]> {
  const minutesAgo = new Date()
  minutesAgo.setMinutes(minutesAgo.getMinutes() - NOTIFICATION_WINDOW_MINUTES)

  const { data, error } = await supabase
    .from('activities')
    .select(
      `
      *,
      entity:entity_metadata (
        type,
        name,
        object
      ),
      parentEntity:parent_entity_metadata (
        type,
        name,
        object
      ),
      user:users (
        id,
        username,
        authUserFk:auth_user_fk
      )
    `,
    )
    .gt('created_at', minutesAgo.toISOString())
    .is('notified', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching activities:', error)
    return []
  }

  return data || []
}

function groupActivitiesByUser(activities: Activity[]): NotificationGroup[] {
  const groupsByUser = new Map<number, NotificationGroup>()

  for (const activity of activities) {
    if (!activity.user) continue

    const userId = activity.user.id

    if (!groupsByUser.has(userId)) {
      groupsByUser.set(userId, {
        userId,
        authUserId: activity.user.authUserFk,
        username: activity.user.username,
        activities: [],
      })
    }

    groupsByUser.get(userId)?.activities.push(activity)
  }

  return Array.from(groupsByUser.values())
}

async function getUserSubscriptions(authUserId: string): Promise<PushSubscription[]> {
  const { data, error } = await supabase.from('push_subscriptions').select('*').eq('auth_user_fk', authUserId)

  if (error) {
    console.error('Error fetching push subscriptions:', error)
    return []
  }

  return data || []
}

async function markActivitiesAsNotified(activityIds: number[]): Promise<void> {
  if (activityIds.length === 0) return

  const { error } = await supabase.from('activities').update({ notified: true }).in('id', activityIds)

  if (error) {
    console.error('Error marking activities as notified:', error)
  }
}

function createNotificationContent(group: NotificationGroup): { title: string; body: string } {
  const { activities, username } = group

  // Count activities by type and entity
  const activityTypes = new Set(activities.map((a) => a.type))
  const entityTypes = new Set(activities.map((a) => a.entityType))
  const usernames = new Set(activities.map((a) => a.user.username))

  // Create a simple summary
  let title = `${username} has new activity`
  let body = ''

  if (activities.length === 1) {
    const activity = activities[0]
    if (activity.type === 'created') {
      if (activity.entityType === 'ascent') {
        body = `${username} logged a new ascent`
      } else {
        body = `${username} created a new ${activity.entityType}`
      }
    } else if (activity.type === 'updated') {
      body = `${username} updated a ${activity.entityType}`
    }
  } else {
    // Multiple activities
    body = `${username} made ${activities.length} updates`

    if (entityTypes.size === 1) {
      body += ` to ${activities[0].entityType}s`
    }
  }

  return { title, body }
}

async function sendNotificationsForGroup(group: NotificationGroup): Promise<boolean> {
  const subscriptions = await getUserSubscriptions(group.authUserId)
  if (subscriptions.length === 0) return false

  const { title, body } = createNotificationContent(group)

  const notificationPayload = JSON.stringify({
    title,
    body,
    icon: '/android-chrome-192x192.png',
    data: {
      url: '/',
    },
  })

  // Send to all of the user's subscriptions
  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
          expirationTime: subscription.expirationTime || undefined,
        },
        notificationPayload,
      ),
    ),
  )

  // Check if any succeeded
  return results.some((result) => result.status === 'fulfilled')
}

async function processNotifications(): Promise<{ processed: number; sent: number }> {
  // 1. Get recent unnotified activities
  const activities = await getRecentUnnotifiedActivities()
  if (activities.length === 0) {
    return { processed: 0, sent: 0 }
  }

  // 2. Group by user
  const notificationGroups = groupActivitiesByUser(activities)

  // 3. Process each group
  let notificationsSent = 0
  let activityIdsToMark: number[] = []

  for (const group of notificationGroups) {
    try {
      const sent = await sendNotificationsForGroup(group)
      if (sent) {
        notificationsSent++
      }

      // Mark all activities in this group as notified
      activityIdsToMark.push(...group.activities.map((a) => a.id))
    } catch (error) {
      console.error(`Error processing notification group for user ${group.username}:`, error)
    }
  }

  // 4. Mark activities as notified
  await markActivitiesAsNotified(activityIdsToMark)

  return {
    processed: activities.length,
    sent: notificationsSent,
  }
}

serve(async (req) => {
  try {
    const result = await processNotifications()

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error processing notifications:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
