import { RESEND_API_KEY, RESEND_SENDER_EMAIL } from '$env/static/private'
import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
import { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import type { RequestEvent } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { authUsers } from 'drizzle-orm/supabase'
import { Resend } from 'resend'
import type { Notification } from '.'
import { sendNotificationToSubscription } from './notifications.server'

const resend = new Resend(RESEND_API_KEY)

const getEmailBase = (title: string, content: string) => {
  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
  </head>
  <body
    style='background-color:rgb(243,244,246);font-family:ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";padding-top:40px;padding-bottom:40px'>
    <!--$-->
    <div
      style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">
      ${title}
    </div>
    <table
      align="center"
      width="100%"
      border="0"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="background-color:rgb(255,255,255);border-radius:8px;padding:48px;max-width:600px;margin-left:auto;margin-right:auto">
      <tbody>
        <tr style="width:100%">
          <td>
            ${content}
          </td>
        </tr>
      </tbody>
    </table>
    <!--7--><!--/$-->
  </body>
</html>
  `
}

interface BaseOpts {
  authUserFk: string
  regionName: string
}
const getNotificationBase = async ({ authUserFk }: BaseOpts) => {
  const pushSubscriptions = await db.query.pushSubscriptions.findMany({
    where: eq(schema.pushSubscriptions.authUserFk, authUserFk),
  })
  const authUsersResult = await db
    .select({ email: authUsers.email })
    .from(authUsers)
    .where(eq(authUsers.id, authUserFk))
  const user = await db.query.users.findFirst({ where: eq(schema.users.authUserFk, authUserFk) })
  const authUser = authUsersResult.at(0)

  return {
    pushSubscriptions,
    authUser,
    user,
  }
}

export const notifyFirstRoleAdded = async (event: RequestEvent, { authUserFk, regionName }: BaseOpts) => {
  const { pushSubscriptions, authUser, user } = await getNotificationBase({ authUserFk, regionName })
  const title = `Welcome to ${PUBLIC_APPLICATION_NAME}`

  if (authUser?.email == null || user == null) {
    return
  }

  if (pushSubscriptions.length > 0) {
    const notification: Notification = {
      body: `You have been granted access to ${regionName}`,
      title,
      type: 'user',
      userId: user.id,
    }
    await Promise.all(
      pushSubscriptions.map(async (subscription) => {
        await sendNotificationToSubscription(notification, subscription)
      }),
    )
  }

  await resend.emails.send({
    from: RESEND_SENDER_EMAIL,
    to: [authUser.email],
    subject: title,
    html: getEmailBase(
      title,
      `
        <h1
          style="font-size:24px;font-weight:700;color:rgb(31,41,55);margin:0px;margin-bottom:24px">
          Access Granted:
          ${regionName}
        </h1>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:24px">
          Hello
          ${user.username},
        </p>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:24px">
          Great news! Your access request has been
          <strong>approved</strong>, and you now have access to the
          <strong>${regionName}</strong> region in ${PUBLIC_APPLICATION_NAME}.
        </p>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:32px">
          You can now log in and start using all the features available to
          your account.
        </p>
        <table
          align="center"
          width="100%"
          border="0"
          cellpadding="0"
          cellspacing="0"
          role="presentation"
          style="text-align:center;margin-bottom:32px">
          <tbody>
            <tr>
              <td>
                <a
                  href="${event.url.origin}/auth/signin"
                  style="background-color:rgb(130,58,165);color:rgb(255,255,255);font-weight:700;padding-top:12px;padding-bottom:12px;padding-left:24px;padding-right:24px;border-radius:4px;text-decoration-line:none;text-align:center;box-sizing:border-box;line-height:100%;text-decoration:none;display:inline-block;max-width:100%;mso-padding-alt:0px;padding:12px 24px 12px 24px"
                  target="_blank"
                  ><span
                    ><!--[if mso]><i style="mso-font-width:400%;mso-text-raise:18" hidden>&#8202;&#8202;&#8202;</i><![endif]--></span
                  ><span
                    style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:9px"
                    >Log In Now</span
                  ><span
                    ><!--[if mso]><i style="mso-font-width:400%" hidden>&#8202;&#8202;&#8202;&#8203;</i><![endif]--></span
                  ></a
                >
              </td>
            </tr>
          </tbody>
        </table>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:24px">
          As a member of the
          ${regionName}
          region, you can:
        </p>
        <ul style="padding-left:24px;margin-top:0px;margin-bottom:32px">
          <li
            style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-bottom:8px">
            Document your ascents and track your progress
          </li>
          <li
            style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-bottom:8px">
            Access detailed climbing topos
          </li>
          <li
            style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-bottom:8px">
            Connect with the climbing community</li>
        </ul>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:32px">
          If you have any questions about your access or need assistance
          getting started, please contact your region administrator or our
          support team.
        </p>
        <hr
          style="border-color:rgb(229,231,235);margin-top:32px;margin-bottom:32px;width:100%;border:none;border-top:1px solid #eaeaea" />
        <p
          style="font-size:14px;color:rgb(107,114,128);margin-top:0px;margin-bottom:8px;line-height:24px">
          Thank you for your patience during the approval process.
        </p>
        <p
          style="font-size:14px;font-weight:700;color:rgb(107,114,128);margin-top:0px;margin-bottom:32px;line-height:24px">
          The ${PUBLIC_APPLICATION_NAME} Team
        </p>
    `,
    ),
  })
}

export const notifyRoleAdded = async (event: RequestEvent, { authUserFk, regionName }: BaseOpts) => {
  const { pushSubscriptions, authUser, user } = await getNotificationBase({ authUserFk, regionName })
  const title = `Update on your ${PUBLIC_APPLICATION_NAME} Account`

  if (authUser?.email == null || user == null) {
    return
  }

  if (pushSubscriptions.length > 0) {
    const notification: Notification = {
      body: `You have been granted access to ${regionName}`,
      title,
      type: 'user',
      userId: user.id,
    }
    await Promise.all(
      pushSubscriptions.map(async (subscription) => {
        await sendNotificationToSubscription(notification, subscription)
      }),
    )
  }

  await resend.emails.send({
    from: RESEND_SENDER_EMAIL,
    to: [authUser.email],
    subject: title,
    html: getEmailBase(
      title,
      `
        <h1
          style="font-size:24px;font-weight:700;color:rgb(31,41,55);margin:0px;margin-bottom:24px">
          Access Granted:
          ${regionName}
        </h1>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:24px">
          Hello
          ${user.username},
        </p>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:24px">
          Great news! You now have access to the
          <strong>${regionName}</strong> region in ${PUBLIC_APPLICATION_NAME}.
        </p>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:32px">
          You can now log in and start using all the features available to
          your account.
        </p>
        <table
          align="center"
          width="100%"
          border="0"
          cellpadding="0"
          cellspacing="0"
          role="presentation"
          style="text-align:center;margin-bottom:32px">
          <tbody>
            <tr>
              <td>
                <a
                  href="${event.url.origin}/auth/signin"
                  style="background-color:rgb(130,58,165);color:rgb(255,255,255);font-weight:700;padding-top:12px;padding-bottom:12px;padding-left:24px;padding-right:24px;border-radius:4px;text-decoration-line:none;text-align:center;box-sizing:border-box;line-height:100%;text-decoration:none;display:inline-block;max-width:100%;mso-padding-alt:0px;padding:12px 24px 12px 24px"
                  target="_blank"
                  ><span
                    ><!--[if mso]><i style="mso-font-width:400%;mso-text-raise:18" hidden>&#8202;&#8202;&#8202;</i><![endif]--></span
                  ><span
                    style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:9px"
                    >Log In Now</span
                  ><span
                    ><!--[if mso]><i style="mso-font-width:400%" hidden>&#8202;&#8202;&#8202;&#8203;</i><![endif]--></span
                  ></a
                >
              </td>
            </tr>
          </tbody>
        </table>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:32px">
          If you have any questions about your access or need assistance
          getting started, please contact your region administrator or our
          support team.
        </p>
        <hr
          style="border-color:rgb(229,231,235);margin-top:32px;margin-bottom:32px;width:100%;border:none;border-top:1px solid #eaeaea" />
        <p
          style="font-size:14px;font-weight:700;color:rgb(107,114,128);margin-top:0px;margin-bottom:32px;line-height:24px">
          The ${PUBLIC_APPLICATION_NAME} Team
        </p>
    `,
    ),
  })
}

export const notifyRoleRemoved = async (event: RequestEvent, { authUserFk, regionName }: BaseOpts) => {
  const { pushSubscriptions, authUser, user } = await getNotificationBase({ authUserFk, regionName })
  const title = `Update on your ${PUBLIC_APPLICATION_NAME} Account`

  if (authUser?.email == null || user == null) {
    return
  }

  if (pushSubscriptions.length > 0) {
    const notification: Notification = {
      body: `Your access to ${regionName} has been removed`,
      title,
      type: 'user',
      userId: user.id,
    }
    await Promise.all(
      pushSubscriptions.map(async (subscription) => {
        await sendNotificationToSubscription(notification, subscription)
      }),
    )
  }

  await resend.emails.send({
    from: RESEND_SENDER_EMAIL,
    to: [authUser.email],
    subject: title,
    html: getEmailBase(
      title,
      `
        <h1
          style="font-size:24px;font-weight:700;color:rgb(31,41,55);margin:0px;margin-bottom:24px">
          Access Removed:
          ${regionName}
        </h1>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:24px">
          Hello
          ${user.username},
        </p>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:24px">
          We regret to inform you that your access to the
          <strong>${regionName}</strong> region in ${PUBLIC_APPLICATION_NAME} has been removed.
        </p>
        <table
          align="center"
          width="100%"
          border="0"
          cellpadding="0"
          cellspacing="0"
          role="presentation"
          style="text-align:center;margin-bottom:32px">
          <tbody>
            <tr>
              <td>
                <a
                  href="${event.url.origin}/auth/signin"
                  style="background-color:rgb(130,58,165);color:rgb(255,255,255);font-weight:700;padding-top:12px;padding-bottom:12px;padding-left:24px;padding-right:24px;border-radius:4px;text-decoration-line:none;text-align:center;box-sizing:border-box;line-height:100%;text-decoration:none;display:inline-block;max-width:100%;mso-padding-alt:0px;padding:12px 24px 12px 24px"
                  target="_blank"
                  ><span
                    ><!--[if mso]><i style="mso-font-width:400%;mso-text-raise:18" hidden>&#8202;&#8202;&#8202;</i><![endif]--></span
                  ><span
                    style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:9px"
                    >Log In Now</span
                  ><span
                    ><!--[if mso]><i style="mso-font-width:400%" hidden>&#8202;&#8202;&#8202;&#8203;</i><![endif]--></span
                  ></a
                >
              </td>
            </tr>
          </tbody>
        </table>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:32px">
          If you have any questions about your access or need assistance
          getting started, please contact your region administrator or our
          support team.
        </p>
        <hr
          style="border-color:rgb(229,231,235);margin-top:32px;margin-bottom:32px;width:100%;border:none;border-top:1px solid #eaeaea" />
        <p
          style="font-size:14px;font-weight:700;color:rgb(107,114,128);margin-top:0px;margin-bottom:32px;line-height:24px">
          The ${PUBLIC_APPLICATION_NAME} Team
        </p>
    `,
    ),
  })
}

interface NotifyRoleUpdatedProps extends BaseOpts {
  role: string
}
export const notifyRoleUpdated = async (
  event: RequestEvent,
  { authUserFk, regionName, role }: NotifyRoleUpdatedProps,
) => {
  const { pushSubscriptions, authUser, user } = await getNotificationBase({ authUserFk, regionName })
  const title = `Update on your ${PUBLIC_APPLICATION_NAME} Account`

  if (authUser?.email == null || user == null) {
    return
  }

  if (pushSubscriptions.length > 0) {
    const notification: Notification = {
      body: `Your access to ${regionName} has been updated to ${role}`,
      title,
      type: 'user',
      userId: user.id,
    }
    await Promise.all(
      pushSubscriptions.map(async (subscription) => {
        await sendNotificationToSubscription(notification, subscription)
      }),
    )
  }

  await resend.emails.send({
    from: RESEND_SENDER_EMAIL,
    to: [authUser.email],
    subject: title,
    html: getEmailBase(
      title,
      `
        <h1
          style="font-size:24px;font-weight:700;color:rgb(31,41,55);margin:0px;margin-bottom:24px">
          Access Updated:
          ${regionName}
        </h1>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:24px">
          Hello
          ${user.username},
        </p>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:24px">
          Your access to the
          <strong>${regionName}</strong> region in ${PUBLIC_APPLICATION_NAME} has been updated to
          <strong>${role}</strong>.
        </p>
        <table
          align="center"
          width="100%"
          border="0"
          cellpadding="0"
          cellspacing="0"
          role="presentation"
          style="text-align:center;margin-bottom:32px">
          <tbody>
            <tr>
              <td>
                <a
                  href="${event.url.origin}/auth/signin"
                  style="background-color:rgb(130,58,165);color:rgb(255,255,255);font-weight:700;padding-top:12px;padding-bottom:12px;padding-left:24px;padding-right:24px;border-radius:4px;text-decoration-line:none;text-align:center;box-sizing:border-box;line-height:100%;text-decoration:none;display:inline-block;max-width:100%;mso-padding-alt:0px;padding:12px 24px 12px 24px"
                  target="_blank"
                  ><span
                    ><!--[if mso]><i style="mso-font-width:400%;mso-text-raise:18" hidden>&#8202;&#8202;&#8202;</i><![endif]--></span
                  ><span
                    style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:9px"
                    >Log In Now</span
                  ><span
                    ><!--[if mso]><i style="mso-font-width:400%" hidden>&#8202;&#8202;&#8202;&#8203;</i><![endif]--></span
                  ></a
                >
              </td>
            </tr>
          </tbody>
        </table>
        <p
          style="font-size:16px;line-height:24px;color:rgb(75,85,99);margin-top:0px;margin-bottom:32px">
          If you have any questions about your access or need assistance
          getting started, please contact your region administrator or our
          support team.
        </p>
        <hr
          style="border-color:rgb(229,231,235);margin-top:32px;margin-bottom:32px;width:100%;border:none;border-top:1px solid #eaeaea" />
        <p
          style="font-size:14px;font-weight:700;color:rgb(107,114,128);margin-top:0px;margin-bottom:32px;line-height:24px">
          The ${PUBLIC_APPLICATION_NAME} Team
        </p>
    `,
    ),
  })
}
