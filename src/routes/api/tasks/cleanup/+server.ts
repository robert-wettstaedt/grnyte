import { FEEDBACK_MAX_AGE_MS, sweepFeedback } from '$lib/entities/feedback/retention.server'
import { reportBunnyOrphans } from '$lib/entities/file/cleanup.server'
import { reconcileReadiness } from '$lib/entities/file/readiness.server'
import { BUNNY_MAX_AGE_MS, STAGING_MAX_AGE_MS, sweepBunny, sweepStaging } from '$lib/entities/file/sweep.server'
import { DECISION_MAX_AGE_MS, sweepDecisions } from '$lib/entities/moderation/retention.server'
import {
  NOTIFICATION_READ_MAX_AGE_MS,
  NOTIFICATION_UNREAD_MAX_AGE_MS,
  sweepNotifications,
} from '$lib/entities/notification/retention.server'
import { COMMENT_UNDO_MS, eraseDeletedComments } from '$lib/entities/reaction/retention.server'
import { closeGoneReports } from '$lib/entities/report/retention.server'
import { sweepUnconfirmedAccounts, UNCONFIRMED_MAX_AGE_MS } from '$lib/entities/user/unconfirmed.server'
import { sweepSpentChallenges } from '$lib/forms/proofOfWork.server'
import { ERROR_LOG_MAX_AGE_MS, sweepErrorLogs } from '$lib/logging/retention.server'
import { isCronAuthorized } from '$lib/remote/cron.server'
import { getVideoProvider } from '$lib/videos/provider.server'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }
  const now = Date.now()
  // reportBunnyOrphans stays last and unbound: it resolves to nothing, so anything destructured
  // after it silently takes its `void`.
  const [
    staging,
    bunny,
    notificationRows,
    feedbackRows,
    errorRows,
    challengeRows,
    accountRows,
    decisionRows,
    commentRows,
    reportRows,
    readinessRows,
  ] = await Promise.all([
    sweepStaging(new Date(now - STAGING_MAX_AGE_MS)),
    sweepBunny(new Date(now - BUNNY_MAX_AGE_MS)),
    sweepNotifications(new Date(now - NOTIFICATION_READ_MAX_AGE_MS), new Date(now - NOTIFICATION_UNREAD_MAX_AGE_MS)),
    sweepFeedback(new Date(now - FEEDBACK_MAX_AGE_MS)),
    sweepErrorLogs(new Date(now - ERROR_LOG_MAX_AGE_MS)),
    sweepSpentChallenges(new Date(now)),
    sweepUnconfirmedAccounts(new Date(now - UNCONFIRMED_MAX_AGE_MS)),
    sweepDecisions(new Date(now - DECISION_MAX_AGE_MS)),
    eraseDeletedComments(new Date(now - COMMENT_UNDO_MS)),
    closeGoneReports(),
    reconcileReadiness(getVideoProvider()),
    // Alongside the deletes, not ahead of them: it walks the whole Bunny library, and its own
    // failure must never cost a retention delete this job promises.
    reportBunnyOrphans(new Date(now - BUNNY_MAX_AGE_MS)),
  ])
  console.log(
    `[cleanup] removed ${staging} staging objects, ${bunny} orphaned videos, ${notificationRows} notifications, ${feedbackRows} feedback, ${errorRows} error logs, ${challengeRows} spent challenges, ${accountRows} unconfirmed accounts, ${decisionRows} moderation decisions, erased ${commentRows} deleted comments, closed ${reportRows} reports on content that is gone, corrected ${readinessRows} video readiness`,
  )
  return json({
    accounts: accountRows,
    bunny,
    challenges: challengeRows,
    comments: commentRows,
    decisions: decisionRows,
    errorLogs: errorRows,
    feedback: feedbackRows,
    notifications: notificationRows,
    readiness: readinessRows,
    reports: reportRows,
    staging,
  })
}
