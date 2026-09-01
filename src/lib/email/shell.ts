import { GRADE_COLORS } from '$lib/entities/grade/color'
import { m } from '$lib/paraglide/messages'
import { locales } from '$lib/paraglide/runtime'

/**
 * The one email shell. Every mail grnyte sends renders through here: the Supabase
 * Auth (GoTrue) templates in `templates.ts`, and anything we send via Resend.
 *
 * Why it looks like 1999 HTML: Outlook on Windows renders mail with the Word engine,
 * which has no flexbox, no grid, no `max-width`, and treats `height` on a `<td>` as a
 * hint. Gmail strips `<style>` in some contexts and force-inverts colors in others.
 * So: nested `role="presentation"` tables, every color inline AND mirrored in a class
 * so the dark-mode block can override it, literal 6-digit hex only.
 *
 * Hard rules that keep this from decaying:
 *   - No `var()`, `oklch()`, `rgba()`, 3-digit hex or named colors in the output. A
 *     single inline `oklch()` makes Gmail drop the whole `style` attribute.
 *   - No `#FFFFFF` / `#000000`: pure white inverts to pure black, the harshest result.
 *   - No web fonts. Declaring one at all triggers Outlook's fallback to Times New Roman,
 *     so the design is drawn in the system stack. Space Grotesk stays in the app.
 *   - New templates differentiate through `meta` and `title` only. Never by adding a
 *     motif, a second rule, a color, or a slot.
 * `shell.test.ts` enforces the first three.
 *
 * All slots are PLAIN TEXT and are HTML-escaped on the way in. Go template expressions
 * (`{{ .TokenHash }}`) survive escaping untouched, which is what lets the GoTrue
 * templates share this renderer. Do not pass markup.
 */

export interface EmailAction {
  label: string
  url: string
}

export interface EmailContent {
  /** Button, fallback hint and the pasteable URL. All three appear together or none do. */
  action?: EmailAction
  /** One paragraph per entry. At least one. */
  body: string[]
  /** Mono code well. Reauthentication OTP. */
  code?: string
  /** Which "you got this because" line the footer carries. */
  footerReason?: 'account' | 'invite' | 'signup'
  /** The "if you did not request this" line under the hairline. */
  footnote?: string
  /** Mono entry header. Authored UPPERCASE, at most three fields joined by ` · `. */
  meta: string
  /** The grey line after the subject in the inbox list. Never put a required fact here. */
  preheader: string
  /** Inbox subject. Also the `<title>`. */
  subject: string
  /** The single `<h1>`. */
  title: string
}

export interface EmailInput extends EmailContent {
  /** The RECIPIENT's locale, never the ambient one. */
  locale?: EmailLocale
  /** Origin the logo is loaded from. GoTrue passes `{{ .SiteURL }}` so it self-configures. */
  origin?: string
}

export type EmailLocale = (typeof locales)[number]

const DEFAULT_ORIGIN = 'https://grnyte.rocks'

// Tokens. Compiled from the oklch ramp in src/grnyte.css to literal sRGB hex.

const LIGHT = {
  card: '#FDFBFA', // surface-50
  cta: '#8033A4',
  ctaInk: '#FDFBFA', // 6.95:1
  desk: '#E9E3DF', // surface-200
  edge: '#D6D0CB', // surface-300
  ink: '#242025', // 15.56:1 on card
  link: '#682486', // 9.32:1 on card
  meta: '#775545', // sandstone, 6.42:1 on card
  muted: '#5C5753', // 6.92:1 on card
  well: '#F5F1EE', // surface-100
}

const DARK = {
  card: '#262429', // surface-900 dark
  cta: '#B66EDB',
  ctaInk: '#21092C', // 5.48:1 (the lifted violet carries dark text, as in the app)
  desk: '#19171B', // body-background-color-dark
  edge: '#433F44', // surface-700 dark
  ink: '#F7F5F2', // 14.12:1 on card
  link: '#D49EF2', // 7.30:1 on card
  meta: '#BA8D74', // 5.23:1 on card
  muted: '#A6A09B', // 5.94:1 on card
  well: '#19171B',
}

/**
 * The masthead band is the app's near-black chrome and is NEVER overridden in dark
 * mode. That is the whole trick: partial inverters (Outlook.com, new Outlook, Outlook
 * mobile, Gmail Android) darken light backgrounds and leave dark ones alone, so the
 * band and everything on it survives them untouched. In light mode it reads as dark
 * chrome capping a light page; in dark mode it dissolves into the page and the card
 * lifts out of it, which is the app's own surface hierarchy. One value, two readings.
 */
const BAND = '#1A181D'
const BAND_INK = '#F7F5F2' // 16.19:1

/**
 * Decorative grade heat rule, identical in every template so a hue shift under
 * inversion costs recognition and nothing else. The app's own scale, so a palette
 * change reaches the mail too. Literal 6-digit hex, which is what the shell requires.
 */
const GRADES = GRADE_COLORS

/** Why this mail landed, one line in the footer. Same map for the HTML and the text part, so
 *  the two can never say different things. */
const FOOTER_REASONS = {
  account: m.email_footerReasonAccount,
  invite: m.email_footerReasonInvite,
  signup: m.email_footerReasonSignup,
}

/**
 * A Windows-resident face leads both stacks. Outlook's Word engine does not walk a
 * font-family list the way a browser does: it takes the first name, and if Windows does not
 * have it, hands the name to the font mapper, which lands on Times New Roman. Leading with
 * `-apple-system` and `'SFMono-Regular'` (neither of which exists on Windows) risks serif
 * body copy in classic Outlook.
 *
 * The usual fix is an `<!--[if mso]>` font override, but that is unavailable here: GoTrue
 * renders templates with Go's `html/template`, which elides HTML comments, so every MSO
 * conditional is stripped before the mail is sent. Ordering the stack is the fix that works
 * on both the GoTrue and the Resend path. Apple clients skip the Windows-only names as usual.
 */
const SANS = `'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif`
const MONO = `Consolas,'SFMono-Regular','Liberation Mono',Menlo,'Courier New',Courier,monospace`
const sans = `font-family:${SANS};mso-generic-font-family:swiss;`
const mono = `font-family:${MONO};mso-generic-font-family:modern;`

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A vertical gap. Never `margin`: Outlook drops it on table cells. */
const spacer = (height: number) =>
  `<tr aria-hidden="true" role="presentation"><td height="${height}" style="height:${height}px;font-size:0;line-height:0;">&nbsp;</td></tr>`

const row = (content: string) => `<tr><td>${content}</td></tr>`

/**
 * Dark mode, declared once and emitted twice: as a `prefers-color-scheme` query for
 * clients that honour it, and as `[data-ogsb]`/`[data-ogsc]` attribute selectors, which
 * is the only hook Outlook.com and new Outlook give us. Every class here also carries
 * the matching light color inline on the element; these rules only ever override.
 */
const DARK_MAP: [selector: string, declarations: string][] = [
  ['.desk', `background-color:${DARK.desk}`],
  ['.card', `background-color:${DARK.card}`],
  ['.well', `background-color:${DARK.well}`],
  ['.edge', `border-color:${DARK.edge}`],
  ['.rule', `border-top-color:${DARK.edge}`],
  ['.ink', `color:${DARK.ink}`],
  ['.muted', `color:${DARK.muted}`],
  ['.meta', `color:${DARK.meta}`],
  ['.link', `color:${DARK.link}`],
  ['.btn-td', `background-color:${DARK.cta}`],
  ['.btn-a', `background-color:${DARK.cta};color:${DARK.ctaInk}`],
]

const darkRules = (prefix: string) =>
  DARK_MAP.map(
    ([selector, declarations]) =>
      `${prefix}${selector}{${declarations
        .split(';')
        .map((d) => `${d} !important`)
        .join(';')}}`,
  ).join('\n')

/**
 * Everything in here is an enhancement. The email must stay fully legible with this
 * whole block deleted, because some clients drop it. Test that before shipping changes.
 */
const styleBlock = `
:root{color-scheme:light dark;supported-color-schemes:light dark;}
body{margin:0 !important;padding:0 !important;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{border-collapse:collapse !important;mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;display:block;}
h1,p{margin:0;padding:0;mso-line-height-rule:exactly;}
.im{color:inherit !important;}
#MessageViewBody a{color:inherit;text-decoration:none;font-size:inherit;font-family:inherit;font-weight:inherit;line-height:inherit;}
a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;font-size:inherit !important;font-family:inherit !important;font-weight:inherit !important;line-height:inherit !important;}
@media only screen and (max-width:600px){
.w-full{width:100% !important;max-width:100% !important;}
.pad-page{padding:20px 12px !important;}
.pad-band{padding:16px 20px !important;}
.pad-content{padding:24px 20px !important;}
.pad-foot{padding:0 20px !important;}
.h1-sm{font-size:24px !important;line-height:30px !important;}
.code-sm{font-size:28px !important;line-height:34px !important;letter-spacing:4px !important;}
}
/* No mobile rule for the button: it stays left-aligned and shrink-wrapped like the rest of
   the column, and at 50px tall it already clears the 44px tap target at every width. */
@media (prefers-color-scheme:dark){
${darkRules('')}
}
${darkRules('[data-ogsb] ')}
${darkRules('[data-ogsc] ')}
`.trim()

/**
 * Violet appears in exactly two places in this design: the button fill and link text.
 * Left-aligned to match the content column, 50px tall so it clears the 44px tap target.
 * Square in classic Outlook (no VML: a fixed VML width clips longer German labels, and
 * a square button is on brand here anyway).
 *
 * With images off nothing changes, because it is a `bgcolor` cell plus live text. Under
 * Gmail's full inversion the fill goes green and the label near-black at ~10:1, so it
 * stays legible and the label is a full imperative sentence rather than a color cue.
 */
const button = ({ label, url }: EmailAction) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left" style="border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt;">
<tr><td class="btn-td" align="center" bgcolor="${LIGHT.cta}" style="border-radius:6px;background-color:${LIGHT.cta};mso-padding-alt:15px 30px;">
<a class="btn-a" href="${esc(url)}" target="_blank" style="display:block;padding:15px 30px;${sans}font-size:16px;line-height:20px;mso-line-height-rule:exactly;font-weight:700;color:${LIGHT.ctaInk};text-decoration:none;border-radius:6px;-webkit-text-size-adjust:none;mso-hide:none;">${esc(label)}</a>
</td></tr></table>`

/**
 * The wordmark is live text and is the load-bearing element: with every image blocked
 * the masthead still reads "grnyte" in 700 weight on the brand chrome.
 *
 * The mark is `pwa-192x192.png`, which already IS the violet rounded square with the boulder,
 * so the cell behind it must NOT be violet: doing that renders a violet square inside a violet
 * square with a shrunken boulder floating in it. The cell carries the BAND colour instead, which
 * is what the PNG's transparent corners composite against and is invisible when the image is
 * blocked. `apple-touch-icon` and `maskable-icon` are the wrong assets here, both are matted on
 * white and would punch a white box into the dark band.
 *
 * The `<td>` holds a fixed 32x32 either way, so a blocked image never shifts the lockup.
 * `alt=""` because the wordmark right next to it already says the name.
 */
const masthead = (origin: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
<tr>
<td width="40" valign="middle" align="center" bgcolor="${BAND}" style="width:40px;height:40px;background-color:${BAND};font-size:0;line-height:0;"><img src="${esc(origin)}/pwa-192x192.png" alt="" role="presentation" width="40" height="40" border="0" style="display:block;width:40px;height:40px;border:0;outline:none;-ms-interpolation-mode:bicubic;"></td>
<td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
<td valign="middle" style="${sans}font-size:22px;line-height:28px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.4px;color:${BAND_INK};">grnyte</td>
</tr></table>`

const footerLine = (text: string) =>
  `<div class="muted" style="${sans}font-size:12px;line-height:18px;mso-line-height-rule:exactly;color:${LIGHT.muted};">${esc(text)}</div>`

/**
 * Sits outside the card, on the desk: the log page is the card, the imprint is printed
 * on the desk. No unsubscribe link and no List-Unsubscribe header, deliberately: RFC 8058
 * scopes those to promotional mail, and an unsubscribe control on a password reset gets
 * people to opt out of security mail. No postal address either, since grnyte declares no
 * commercial intent (see legal_noCommercialIntent). Add both the day an email here becomes
 * preference-driven rather than strictly transactional.
 */
const footer = (locale: EmailLocale, reason: NonNullable<EmailContent['footerReason']>) => {
  // Height comes from line-height, not `height`: Word supports `height` on td/table/img only,
  // so a `height` div collapses and the three footer lines butt together in classic Outlook.
  const gap = `<div style="font-size:0;line-height:8px;mso-line-height-rule:exactly;">&nbsp;</div>`

  return `
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" class="w-full" style="width:600px;max-width:600px;border-collapse:collapse;">
<tr><td class="pad-foot" style="padding:0;">
<div class="meta" style="${mono}font-size:11px;line-height:16px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:0.4px;color:${LIGHT.meta};">grnyte.rocks</div>
${gap}
${footerLine(FOOTER_REASONS[reason]({}, { locale }))}
${gap}
${footerLine(m.email_footerSecurity({}, { locale }))}
</td></tr></table>`
}

/** The content stack. Order and gaps are fixed; only presence varies. */
const content = (input: EmailInput, locale: EmailLocale) => {
  const rows: string[] = [
    row(
      `<div class="meta" style="${mono}font-size:12px;line-height:16px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:1.2px;color:${LIGHT.meta};">${esc(input.meta)}</div>`,
    ),
    spacer(12),
    row(
      `<h1 class="ink h1-sm" style="margin:0;padding:0;${sans}font-size:26px;line-height:32px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.4px;color:${LIGHT.ink};">${esc(input.title)}</h1>`,
    ),
    spacer(16),
  ]

  input.body.forEach((paragraph, index) => {
    if (index > 0) rows.push(spacer(16))
    rows.push(
      row(
        `<p class="ink" style="margin:0;padding:0;${sans}font-size:16px;line-height:26px;mso-line-height-rule:exactly;font-weight:400;color:${LIGHT.ink};">${esc(paragraph)}</p>`,
      ),
    )
  })

  if (input.code != null) {
    rows.push(
      spacer(24),
      `<tr><td class="well" bgcolor="${LIGHT.well}" style="background-color:${LIGHT.well};padding:20px 24px;"><div class="ink code-sm" style="${mono}font-size:34px;line-height:40px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:5px;color:${LIGHT.ink};">${esc(input.code)}</div></td></tr>`,
    )
  }

  if (input.action != null) {
    // The pasteable URL is not decoration: it is the only route through the email if a
    // client mangles the button's colors, and `word-break` is mandatory or a 110-character
    // token URL pushes the table wide in classic Outlook.
    rows.push(
      spacer(28),
      row(button(input.action)),
      spacer(20),
      row(
        `<div class="muted" style="${sans}font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${LIGHT.muted};">${esc(m.email_fallbackHint({}, { locale }))}</div>`,
      ),
      spacer(4),
      row(
        `<div style="${sans}font-size:13px;line-height:20px;mso-line-height-rule:exactly;word-break:break-all;word-wrap:break-word;"><a class="link" href="${esc(input.action.url)}" target="_blank" style="color:${LIGHT.link};text-decoration:underline;">${esc(input.action.url)}</a></div>`,
      ),
    )
  }

  if (input.footnote != null) {
    rows.push(
      spacer(28),
      `<tr aria-hidden="true" role="presentation"><td class="rule" style="font-size:0;line-height:0;border-top:1px solid ${LIGHT.edge};">&nbsp;</td></tr>`,
      spacer(20),
      row(
        `<div class="muted" style="${sans}font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${LIGHT.muted};">${esc(input.footnote)}</div>`,
      ),
    )
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join('\n')}</table>`
}

export function renderEmailHtml(input: EmailInput): string {
  const locale = input.locale ?? 'en'
  // Trailing slash stripped so a configured origin cannot produce `//pwa-192x192.png`.
  const origin = (input.origin ?? DEFAULT_ORIGIN).replace(/\/+$/, '')
  const reason = input.footerReason ?? 'account'

  // Zero-width entity padding after the preheader, so the inbox preview shows the
  // preheader and stops, instead of running on into the masthead and body copy.
  const preheaderPad = '&#847;&zwnj;&nbsp;&#8199;&shy;'.repeat(10)
  const hidden = `display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${LIGHT.desk};opacity:0;`

  const gradeRule = `<tr aria-hidden="true" role="presentation">${GRADES.map(
    // Height comes from `border-top`, never `height`: Word treats height on a td as a hint.
    (grade) => `<td width="25%" style="width:25%;font-size:0;line-height:0;border-top:3px solid ${grade};">&nbsp;</td>`,
  ).join('')}</tr>`

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html lang="${locale}" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(input.subject)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style type="text/css">
${styleBlock}
</style>
</head>
<body class="desk" style="margin:0;padding:0;background-color:${LIGHT.desk};">
<div style="${hidden}">${esc(input.preheader)}</div>
<div style="${hidden}">${preheaderPad}</div>
<div lang="${locale}" dir="ltr">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="desk" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;background-color:${LIGHT.desk};">
<tr><td align="center" class="pad-page" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" class="w-full" style="width:600px;max-width:600px;border-collapse:collapse;">
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card edge" style="width:100%;border-collapse:collapse;background-color:${LIGHT.card};border:1px solid ${LIGHT.edge};">
${gradeRule}
<tr><td colspan="${GRADES.length}" class="band pad-band" bgcolor="${BAND}" style="background-color:${BAND};padding:18px 24px;">${masthead(origin)}</td></tr>
<tr><td colspan="${GRADES.length}" class="card pad-content" bgcolor="${LIGHT.card}" style="background-color:${LIGHT.card};padding:32px 40px;">${content(input, locale)}</td></tr>
</table>
</td></tr>
${spacer(20)}
<tr><td>${footer(locale, reason)}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</div>
</body>
</html>`
}

/**
 * The plaintext part. Resend assembles multipart/alternative when both are passed, which
 * text-only clients and previews need and which materially helps deliverability. GoTrue
 * cannot send one (it sets a single text/html body), so this is Resend-only.
 */
export function renderEmailText(input: EmailInput): string {
  const locale = input.locale ?? 'en'
  const blocks = [input.meta, input.title, ...input.body]

  if (input.code != null) blocks.push(input.code)
  if (input.action != null) blocks.push(`${input.action.label}:\n${input.action.url}`)
  if (input.footnote != null) blocks.push(input.footnote)

  blocks.push(
    [
      '--',
      'grnyte.rocks',
      FOOTER_REASONS[input.footerReason ?? 'account']({}, { locale }),
      m.email_footerSecurity({}, { locale }),
    ].join('\n'),
  )

  return blocks.join('\n\n')
}
